// Headless smoke test against a running copy of the explorer (local preview or production).
//
//   node scripts/smoke.mjs [url]        (default http://localhost:4173, or $SMOKE_URL)
//
// It connects to the live Nox testnet and runs the built-in examples on the Balance,
// Transaction and Contract tabs. It also fails if the page contacts a host outside
// the allowlist below, so a new direct third-party request is caught before it ships.
import { chromium } from "playwright";

const target = new URL(process.argv[2] || process.env.SMOKE_URL || "http://localhost:4173");
const CONNECT_TIMEOUT = 90_000;
const QUERY_TIMEOUT = 75_000;
const ATTEMPTS = 2;

// Hosts the page may contact on its own: itself, the Nox seed and ingress nodes,
// and the public Arb Sepolia RPC the SDK uses to verify the topology on-chain.
const ALLOWED_HOSTS = [
  (h) => h === target.host,
  (h) => h === "hisoka.io" || h.endsWith(".hisoka.io"),
  (h) => h === "sepolia-rollup.arbitrum.io",
];

const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const failures = [];
const contacted = new Map();
const pageErrors = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SMOKE_CHROMIUM || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("request", (req) => {
  try {
    const u = new URL(req.url());
    if (u.protocol === "data:" || u.protocol === "blob:") return;
    contacted.set(u.host, (contacted.get(u.host) || 0) + 1);
  } catch {
    // ignore unparsable URLs
  }
});
page.on("pageerror", (err) => pageErrors.push(err.message.slice(0, 300)));

async function mainText() {
  return (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 400);
}

async function step(name, fn) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const start = Date.now();
    try {
      await fn();
      console.log(`ok    ${name} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
      return;
    } catch (err) {
      const detail = `${err instanceof Error ? err.message.split("\n")[0] : err} | main: ${await mainText().catch(() => "?")}`;
      if (attempt < ATTEMPTS) {
        console.log(`retry ${name}: ${detail}`);
      } else {
        console.log(`FAIL  ${name}: ${detail}`);
        failures.push(name);
      }
    }
  }
}

async function tab(name) {
  await page.locator("header nav").getByRole("button", { name, exact: true }).click();
}

async function example(label, expectText) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.getByText(expectText).first().waitFor({ timeout: QUERY_TIMEOUT });
  const errors = await page.locator("main .border-error\\/30").count();
  if (errors > 0) throw new Error("error panel shown");
}

console.log(`smoke target: ${target.href}`);
await page.goto(target.href, { waitUntil: "domcontentloaded" });

await step("connect to mixnet", async () => {
  await page.getByText("Connected", { exact: true }).waitFor({ timeout: CONNECT_TIMEOUT });
});

if (failures.length === 0) {
  await step("balance lookup (RPC)", async () => {
    await tab("Balance");
    await example("Gov Safe", "Routed privately in");
  });

  await step("transaction lookup", async () => {
    await tab("Transaction");
    await example("Gov Safe setup", "Routed privately in");
  });

  await step("contract read", async () => {
    await tab("Contract");
    await page.getByRole("button", { name: "NoxRegistry", exact: true }).first().click();
    await page.locator("main select").selectOption("relayerCount");
    await page.getByRole("button", { name: "Call", exact: true }).click();
    await page.getByText("relayerCount() result").waitFor({ timeout: QUERY_TIMEOUT });
  });
}

console.log(`header: ${(await page.locator("header").innerText()).replace(/\s+/g, " ").slice(0, 200)}`);
console.log("hosts contacted:");
for (const [host, n] of [...contacted.entries()].sort()) {
  const allowed = ALLOWED_HOSTS.some((ok) => ok(host));
  console.log(`  ${allowed ? "  " : "!!"} ${host} x${n}`);
  if (!allowed) failures.push(`unexpected host ${host}`);
}
if (pageErrors.length > 0) {
  console.log("page errors:");
  pageErrors.slice(0, 10).forEach((e) => console.log(`  ${e}`));
  failures.push("uncaught page errors");
}

await browser.close();
console.log(`done in ${elapsed()}`);
if (failures.length > 0) {
  console.log(`smoke failed: ${failures.join(", ")}`);
  process.exit(1);
}
