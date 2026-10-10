// Headless smoke test of the /anon-rpc page (local preview or production).
//
//   node scripts/smoke-anon-rpc.mjs [site-url]     (default http://localhost:4173, or $SMOKE_URL)
//
// From a cold browser it boots the Nox anon-rpc worker through the reference
// harness (specifier read, bundle keccak check, sandbox, KPS dial), then runs
// every wallet call through worker.fetch and checks each against a direct call.
//
// Optional environment:
//   ANON_RPC_SPECIFIER, ANON_RPC_CHAIN, ANON_RPC_SPECIFIER_RPC  boot this specifier instead of the page default
//   ANON_RPC_BUNDLE      path to a worker bundle: boot it with the page's "bundle file" option
//   ANON_RPC_CONFIG      worker config JSON (for example {"gateways":["<ip>:15005:<certhash>"]})
//   ANON_RPC_TARGET      wallet-call chain preset id (arbitrum-sepolia, ethereum, ethereum-sepolia)
//   ANON_RPC_EXPECT_TRANSPORT  require this transport on every call (tls-tunnel, exit-http)
//   ANON_RPC_REPORT      write a JSON report of timings to this path
//   SMOKE_CHROMIUM       Chromium executable
//
// It fails if the page contacts a host outside the allowlist: the page itself,
// the specifier RPC, the wallet-call RPC (direct comparison) and the bundle
// resolvers. In particular the Nox seed and indexer are never contacted.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const site = new URL(process.argv[2] || process.env.SMOKE_URL || "http://localhost:4173");
const target = new URL("/anon-rpc", site);
for (const [param, env] of [
  ["specifier", "ANON_RPC_SPECIFIER"],
  ["chain", "ANON_RPC_CHAIN"],
  ["rpc", "ANON_RPC_SPECIFIER_RPC"],
  ["target", "ANON_RPC_TARGET"],
]) {
  if (process.env[env]) target.searchParams.set(param, process.env[env]);
}
const bundlePath = process.env.ANON_RPC_BUNDLE || "";
const expectTransport = process.env.ANON_RPC_EXPECT_TRANSPORT || "";

const BOOT_TIMEOUT = 150_000;
const CALL_TIMEOUT = 90_000;
const CALLS = ["chainId", "blockNumber", "balance", "erc20", "batch"];

const t0 = Date.now();
const failures = [];
const contacted = new Map();
const pageErrors = [];
const report = { target: target.href, mode: bundlePath ? "file" : "specifier", steps: {}, calls: {}, hosts: {} };

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SMOKE_CHROMIUM || undefined,
});
// A fresh context is a cold browser: no storage, no cache, no learned anchors.
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();

page.on("request", (req) => {
  try {
    const u = new URL(req.url());
    if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "about:") return;
    contacted.set(u.host, (contacted.get(u.host) || 0) + 1);
  } catch {
    // unparsable URL: ignore
  }
});
page.on("pageerror", (err) => pageErrors.push(err.message.slice(0, 300)));

const text = async (testId) => ((await page.getByTestId(testId).textContent()) ?? "").replace(/\s+/g, " ").trim();

console.log(`smoke target: ${target.href}${bundlePath ? ` (bundle file ${bundlePath})` : ""}`);
await page.goto(target.href, { waitUntil: "domcontentloaded" });
await page.getByTestId("boot-form").waitFor({ timeout: 30_000 });

// The page fits a phone screen: no horizontal scroll.
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (overflow > 1) failures.push(`page is ${overflow}px wider than a 390px screen`);

if (bundlePath) {
  await page.getByRole("tab", { name: "Bundle file (developer)" }).click();
  await page.getByTestId("input-bundle-file").setInputFiles(bundlePath);
  await page.getByText("keccak 0x").first().waitFor({ timeout: 30_000 });
}
if (process.env.ANON_RPC_CONFIG) {
  await page.getByText("Worker config (optional)").click();
  await page.getByTestId("input-config").fill(process.env.ANON_RPC_CONFIG);
}
if (process.env.ANON_RPC_TARGET) {
  await page.getByTestId("input-target").selectOption(process.env.ANON_RPC_TARGET);
}

const bootStart = Date.now();
await page.getByTestId("boot-start").click();
const formError = page.getByTestId("boot-form-error");
if (await formError.isVisible().catch(() => false)) {
  failures.push(`boot form: ${await formError.innerText()}`);
}

if (failures.length === 0) {
  try {
    await page.waitForFunction(
      () => {
        const phase = document.querySelector('[data-testid="boot-phase"]')?.textContent?.trim();
        return phase === "ready" || phase === "failed";
      },
      undefined,
      { timeout: BOOT_TIMEOUT },
    );
  } catch {
    failures.push(`worker not ready after ${BOOT_TIMEOUT / 1000}s`);
  }
  const phase = await text("boot-phase");
  report.bootMs = Date.now() - bootStart;
  for (const id of ["specifier", "bundle", "sandbox", "wasm", "dial", "topology", "ready"]) {
    const step = page.getByTestId(`step-${id}`);
    report.steps[id] = { status: await step.getAttribute("data-status"), text: (await step.innerText()).replace(/\s+/g, " ") };
  }
  console.log(`boot: ${phase} after ${(report.bootMs / 1000).toFixed(1)}s`);
  for (const step of Object.values(report.steps)) console.log(`  ${step.status.padEnd(7)} ${step.text}`);
  if (phase !== "ready") {
    const err = await page.getByTestId("boot-error").innerText({ timeout: 5_000 }).catch(() => "(no error panel)");
    failures.push(`boot ${phase}: ${err.replace(/\s+/g, " ")}`);
  } else {
    report.entry = await text("active-entry");
    report.hash = await text("info-hash");
    report.specifier = await text("info-specifier");
    report.transport = await text("info-transport");
    console.log(`transport: ${report.transport}`);
    console.log(`entry: ${report.entry}`);
    console.log(`hash: ${report.hash}`);
    if (!/certhash u[A-Za-z0-9_-]{6,}/.test(report.entry)) failures.push(`active entry not shown: ${report.entry}`);
    if (!/0x[0-9a-f]{64}/.test(report.hash)) failures.push(`bundle hash not shown: ${report.hash}`);

    // Turn on the direct comparison so the smoke also checks the results agree.
    await page.getByTestId("input-compare").check();
    await page.getByTestId("call-run-all").click();
    for (const id of CALLS) {
      const anon = page.getByTestId(`call-${id}-anon`);
      let state = "running";
      try {
        await page.waitForFunction(
          (sel) => {
            const s = document.querySelector(sel)?.getAttribute("data-state");
            return s === "ok" || s === "error";
          },
          `[data-testid="call-${id}-anon"]`,
          { timeout: CALL_TIMEOUT },
        );
        state = await anon.getAttribute("data-state");
      } catch {
        state = "timeout";
      }
      if (state === "error") {
        // One retry per call: the mixnet can drop a packet on a node restart.
        await page.getByTestId(`call-${id}-run`).click();
        await page
          .waitForFunction(
            (sel) => {
              const s = document.querySelector(sel)?.getAttribute("data-state");
              return s === "ok" || s === "error";
            },
            `[data-testid="call-${id}-anon"]`,
            { timeout: CALL_TIMEOUT },
          )
          .catch(() => undefined);
        state = await anon.getAttribute("data-state");
      }
      const anonText = (await anon.innerText()).replace(/\s+/g, " ");
      const directText = (await page.getByTestId(`call-${id}-direct`).innerText()).replace(/\s+/g, " ");
      const compare = ((await page.getByTestId(`call-${id}-compare`).textContent({ timeout: 2_000 }).catch(() => "")) ?? "").trim();
      const transport =
        (await page.getByTestId(`call-${id}-anon-transport`).getAttribute("data-transport", { timeout: 2_000 }).catch(() => null)) ?? "";
      report.calls[id] = { state, anon: anonText, direct: directText, compare, transport };
      console.log(`${state === "ok" ? "ok   " : "FAIL "} ${id}: ${anonText} | ${directText} | ${compare}${transport ? ` | transport ${transport}` : ""}`);
      if (expectTransport && state === "ok" && transport !== expectTransport) {
        failures.push(`call ${id}: transport ${transport || "(none shown)"}, expected ${expectTransport}`);
      }
      if (state !== "ok") failures.push(`call ${id}: ${anonText}`);
      if (compare === "results differ") failures.push(`call ${id}: Nox and direct results differ`);
    }
  }
}

// Hosts: the page, the specifier RPC, the wallet-call RPC and the resolvers.
const allowed = new Set([site.host]);
const addHost = (value) => {
  try {
    allowed.add(new URL(value).host);
  } catch {
    // not a URL
  }
};
addHost(await page.getByTestId("input-target-rpc").inputValue({ timeout: 2_000 }).catch(() => ""));
addHost(
  await page
    .getByTestId("input-specifier-rpc")
    .inputValue({ timeout: 2_000 })
    .catch(() => process.env.ANON_RPC_SPECIFIER_RPC || ""),
);
for (const href of await page.locator('[data-testid="info-resolver"] a').evaluateAll((as) => as.map((a) => a.href))) addHost(href);
console.log("hosts contacted:");
for (const [host, n] of [...contacted.entries()].sort()) {
  const ok = allowed.has(host);
  report.hosts[host] = n;
  console.log(`  ${ok ? "  " : "!!"} ${host} x${n}`);
  if (!ok) failures.push(`unexpected host ${host}`);
}
if (pageErrors.length > 0) {
  console.log("page errors:");
  pageErrors.slice(0, 10).forEach((e) => console.log(`  ${e}`));
  failures.push("uncaught page errors");
}

report.failures = failures;
report.totalMs = Date.now() - t0;
if (process.env.ANON_RPC_REPORT) writeFileSync(process.env.ANON_RPC_REPORT, JSON.stringify(report, null, 2));

await browser.close();
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures.length > 0) {
  console.log(`smoke failed: ${failures.join("; ")}`);
  process.exit(1);
}
