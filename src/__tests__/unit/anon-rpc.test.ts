import { describe, it, expect } from "vitest";
import { encodeFunctionResult, keccak256, toHex } from "viem";
import {
  DEFAULT_ENTRIES,
  FALLBACK_SPECIFIER_CHAIN_ID,
  RELEASED_SPECIFIER,
  HARNESS_VERSION,
  parseConfigText,
  resolveDefaults,
  SPECIFIER_CHAINS,
  TARGET_PRESETS,
} from "@/anon-rpc/lib/config";
import {
  SPECIFIER_ABI,
  WORKER_HASH_SELECTOR,
  WORKER_RESOLVERS_SELECTOR,
  localSpecifierAddress,
  memoryProvider,
  readSpecifier,
} from "@/anon-rpc/lib/specifier";
import { fetchVerifiedBundle, resolverKind } from "@/anon-rpc/lib/bundle";
import {
  bootReducer,
  callTransport,
  initialBootState,
  transportEvent,
  tunnelEligible,
  parseWorkerLog,
  requestTiming,
  stepDuration,
  type BootAction,
} from "@/anon-rpc/lib/timeline";
import { configEntries, parseKpsAddress, resolveEntry } from "@/anon-rpc/lib/entries";
import { describeError, hintForFailedCode } from "@/anon-rpc/lib/errors";
import { buildRequest, compareValues, extractValues, formatUnits, runCall, summarize } from "@/anon-rpc/lib/calls";
import { isAnonRpcPath } from "@/anon-rpc/route";
import packageJson from "../../../package.json?raw";

const ADDR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const BUNDLE = new TextEncoder().encode("anonRpcWorker.signalReady();");
const HASH = keccak256(BUNDLE);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A fake chain answering eth_chainId and the two specifier reads. */
function chainFetch(chainId: number, hash: string, resolvers: string[]) {
  const hashRet = encodeFunctionResult({ abi: SPECIFIER_ABI, functionName: "workerHash", result: hash as `0x${string}` });
  const resRet = encodeFunctionResult({ abi: SPECIFIER_ABI, functionName: "workerResolvers", result: resolvers });
  return async (_url: string, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body)) as { method: string; params: [{ data: string }] };
    if (req.method === "eth_chainId") return jsonResponse({ jsonrpc: "2.0", id: 1, result: toHex(chainId) });
    const data = req.params[0].data;
    return jsonResponse({ jsonrpc: "2.0", id: 1, result: data === WORKER_HASH_SELECTOR ? hashRet : resRet });
  };
}

describe("route", () => {
  it("matches /anon-rpc with or without a trailing slash", () => {
    expect(isAnonRpcPath("/anon-rpc")).toBe(true);
    expect(isAnonRpcPath("/anon-rpc/")).toBe(true);
    expect(isAnonRpcPath("/")).toBe(false);
    expect(isAnonRpcPath("/anon-rpcx")).toBe(false);
  });
});

describe("page defaults", () => {
  it("prefers the query string, then env, then built-ins", () => {
    const env = { VITE_ANON_RPC_SPECIFIER: ADDR, VITE_ANON_RPC_CHAIN_ID: "421614" };
    expect(resolveDefaults(env, "")).toMatchObject({ specifier: ADDR, chainId: 421614, specifierRpc: "https://sepolia-rollup.arbitrum.io/rpc" });
    const other = "0x0000000000000000000000000000000000000001";
    expect(resolveDefaults(env, `?specifier=${other}&chain=31337&rpc=http://127.0.0.1:8545`)).toMatchObject({
      specifier: other,
      chainId: 31337,
      specifierRpc: "http://127.0.0.1:8545",
    });
  });

  it("ignores invalid values", () => {
    const d = resolveDefaults({ VITE_ANON_RPC_SPECIFIER: "nope", VITE_ANON_RPC_CHAIN_ID: "-3" }, "?rpc=ftp://x&target=mars");
    expect(d.specifier).toBe(RELEASED_SPECIFIER.address);
    expect(d.chainId).toBe(FALLBACK_SPECIFIER_CHAIN_ID);
    expect(d.specifierRpc).toBe(SPECIFIER_CHAINS.find((c) => c.id === FALLBACK_SPECIFIER_CHAIN_ID)?.rpcUrl);
    expect(d.targetPresetId).toBe(TARGET_PRESETS[0].id);
  });

  it("defaults to the released specifier on its own chain only", () => {
    expect(resolveDefaults({}, "")).toMatchObject({
      specifier: RELEASED_SPECIFIER.address,
      chainId: RELEASED_SPECIFIER.chainId,
      specifierRpc: "https://ethereum-sepolia-rpc.publicnode.com",
    });
    expect(resolveDefaults({}, "?chain=31337").specifier).toBe("");
    expect(resolveDefaults({ VITE_ANON_RPC_CHAIN_ID: "421614" }, "").specifier).toBe("");
  });

  it("treats a blank config as no config", () => {
    expect(parseConfigText("  ")).toBeUndefined();
    expect(parseConfigText('{"v":1}')).toEqual({ v: 1 });
    expect(() => parseConfigText("{")).toThrow();
  });

  it("loads the harness version package.json pins", () => {
    const pkg = JSON.parse(packageJson) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@anon-rpc/browser-harness"]).toBe(HARNESS_VERSION);
  });
});

describe("specifier", () => {
  it("reads hash and resolvers after checking the chain", async () => {
    const read = await readSpecifier(chainFetch(11155111, HASH, ["https://a/x.js", "kps:1.2.3.4:15005:uAA/b"]), "https://rpc", ADDR, 11155111);
    expect(read.workerHash).toBe(HASH);
    expect(read.resolvers).toEqual(["https://a/x.js", "kps:1.2.3.4:15005:uAA/b"]);
  });

  it("refuses an RPC that serves another chain", async () => {
    await expect(readSpecifier(chainFetch(1, HASH, []), "https://rpc", ADDR, 11155111)).rejects.toMatchObject({ code: "wrong-chain" });
  });

  it("refuses a contract with no worker hash", async () => {
    const zero = `0x${"0".repeat(64)}`;
    await expect(readSpecifier(chainFetch(1, zero, []), "https://rpc", ADDR, 1)).rejects.toMatchObject({ code: "not-a-specifier" });
  });

  it("answers the harness from memory with the same encoding", async () => {
    const provider = memoryProvider(ADDR, HASH, ["blob:x", "https://a/x.js"]);
    const read = await readSpecifier(
      async (_u, init) => {
        const req = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
        if (req.method === "eth_chainId") return jsonResponse({ result: "0x1" });
        return jsonResponse({ result: await provider.request({ method: req.method, params: req.params }) });
      },
      "https://rpc",
      ADDR.toLowerCase(),
      1,
    );
    expect(read.workerHash).toBe(HASH);
    expect(read.resolvers).toEqual(["blob:x", "https://a/x.js"]);
    await expect(provider.request({ method: "eth_blockNumber" })).rejects.toThrow();
    await expect(provider.request({ method: "eth_call", params: [{ to: ADDR, data: "0x12345678" }] })).rejects.toThrow();
    expect(WORKER_RESOLVERS_SELECTOR).toBe("0x1c67ff29");
    expect(WORKER_HASH_SELECTOR).toBe("0x3898587d");
  });

  it("derives a stable local address from the hash", () => {
    expect(localSpecifierAddress(HASH)).toBe(`0x${HASH.slice(2, 42)}`);
  });
});

describe("bundle", () => {
  it("takes the first resolver whose bytes match and leaves kps: to the harness", async () => {
    const seen: string[] = [];
    const fetched = await fetchVerifiedBundle(
      async (url) => {
        seen.push(url);
        if (url.endsWith("404.js")) return new Response("", { status: 404 });
        if (url.endsWith("evil.js")) return new Response("other bytes");
        return new Response(BUNDLE);
      },
      ["kps:1.2.3.4:15005:uAA/b", "https://a/404.js", "https://a/evil.js", "https://a/good.js", "https://a/never.js"],
      HASH,
    );
    expect(fetched.resolver).toBe("https://a/good.js");
    expect(fetched.bytes?.byteLength).toBe(BUNDLE.byteLength);
    expect(fetched.outcomes.map((o) => o.kind)).toEqual(["harness", "failed", "mismatch", "ok"]);
    expect(seen).not.toContain("https://a/never.js");
  });

  it("enforces the size cap", async () => {
    const fetched = await fetchVerifiedBundle(async () => new Response(new Uint8Array(100)), ["https://a/big.js"], HASH, { maxBytes: 10 });
    expect(fetched.bytes).toBeNull();
    expect(fetched.outcomes[0]).toMatchObject({ kind: "failed" });
  });

  it("classifies resolvers", () => {
    expect(resolverKind("https://x")).toBe("http");
    expect(resolverKind("kps:1.2.3.4:1:u")).toBe("kps");
    expect(resolverKind("ipfs://x")).toBe("other");
  });
});

describe("boot timeline", () => {
  const log = (event: string, fields: Record<string, unknown> = {}, level = "info") =>
    ({ type: "log", at: 0, log: parseWorkerLog({ level, args: ["nox-worker", event, fields] }) }) as BootAction;

  it("follows the worker's boot events to ready", () => {
    let s = initialBootState(0);
    const steps: BootAction[] = [
      { type: "step", id: "specifier", status: "done", at: 10 },
      { type: "step", id: "bundle", status: "done", at: 20 },
      { type: "step", id: "sandbox", status: "active", at: 21 },
      { ...log("boot.start"), at: 50 } as BootAction,
      { ...log("boot.snapshot", { block: 5, members: 10, anchors: 3 }), at: 51 } as BootAction,
      { ...log("boot.wasm"), at: 60 } as BootAction,
      { ...log("anchor.dial", { anchor: "uEiBVDwIs40b…" }), at: 61 } as BootAction,
      { ...log("kps.dial.ok", { entry: "uEiBVDwIs40b…", ms: 900 }), at: 900 } as BootAction,
      { ...log("topology.accepted", { members: 10, sources: 2 }), at: 1500 } as BootAction,
      { ...log("kps.connected", { entry: "uEiBVDwIs40b…", members: 10 }), at: 1501 } as BootAction,
      { ...log("ready"), at: 1502 } as BootAction,
      { ...log("discovery.verified", { block: 9, members: 10, ms: 4000 }), at: 6000 } as BootAction,
    ];
    for (const a of steps) s = bootReducer(s, a);
    for (const id of ["specifier", "bundle", "sandbox", "wasm", "dial", "topology", "ready", "discovery"] as const) {
      expect(s.steps[id].status, id).toBe("done");
    }
    expect(s.entryLabel).toBe("uEiBVDwIs40b…");
    expect(s.entryDialMs).toBe(900);
    expect(s.members).toBe(10);
    expect(s.steps.ready.endedAt).toBe(1502);
  });

  it("counts retries and records a failure code", () => {
    let s = bootReducer(initialBootState(0), log("anchor.failed", { anchor: "x", code: "timeout" }, "warn"));
    s = bootReducer(s, log("boot.retry", { attempt: 1, code: "no-anchor-reachable", delayMs: 500 }, "warn"));
    expect(s.retries).toBe(2);
    s = bootReducer(s, { type: "step", id: "sandbox", status: "active", at: 1 });
    s = bootReducer(s, { type: "failed", at: 2, code: "bad-config", message: "config.nope is not a known field" });
    expect(s.steps.sandbox.status).toBe("failed");
    expect(s.failure).toEqual({ code: "bad-config", message: "config.nope is not a known field" });
  });

  it("marks a discovery problem as a warning on the snapshot floor", () => {
    const s = bootReducer(initialBootState(0), log("discovery.disagreement", { attempts: 3 }, "warn"));
    expect(s.steps.discovery.status).toBe("warn");
  });

  it("keeps a finished step's duration when the 600 s re-checks and later redials arrive (the 2445.54 s row)", () => {
    // The production page showed "Registry check 2445.54 s": the first check took 45.53 s and four
    // periodic re-checks (every 600 s) each re-closed the step. 2445.54 s = 4 x 600 s + 45.53 s.
    let s = initialBootState(0);
    s = bootReducer(s, { ...log("ready"), at: 1_000 } as BootAction);
    s = bootReducer(s, { ...log("discovery.verified", { block: 1, members: 10, ms: 45_530 }), at: 46_530 } as BootAction);
    for (let i = 1; i <= 4; i++) {
      s = bootReducer(s, { ...log("discovery.verified", { block: 1 + i, members: 10, ms: 30_000 }), at: 46_530 + i * 600_000 } as BootAction);
    }
    expect(stepDuration(s.steps.discovery)).toBe(45_530);
    expect(s.steps.discovery.detail).toContain("agreed in 45530 ms");
    expect(s.later.filter((event) => event.kind === "recheck")).toHaveLength(4);
    expect(s.later[0]).toMatchObject({ kind: "recheck", status: "done", ms: 30_000 });

    // A redial long after boot is a connection event, not a re-closed dial step (the 2416.04 s row).
    s = bootReducer(s, { ...log("anchor.dial", { anchor: "a" }), at: 100 } as BootAction);
    s = bootReducer(s, { ...log("kps.dial.ok", { entry: "a", ms: 900 }), at: 1_000 } as BootAction);
    const dialMs = stepDuration(s.steps.dial);
    s = bootReducer(s, { ...log("kps.dial.failed", { entry: "a", code: "timeout" }, "warn"), at: 2_400_000 } as BootAction);
    s = bootReducer(s, { ...log("entry.failover", { from: "a", to: "b" }, "warn"), at: 2_400_001 } as BootAction);
    expect(stepDuration(s.steps.dial)).toBe(dialMs);
    expect(s.steps.dial.status).toBe("done");
    expect(s.later.filter((event) => event.kind === "connection")).toHaveLength(2);
    expect(s.entryLabel).toBe("b");
    expect(s.retries).toBe(0);
  });

  it("keeps a later discovery warning out of a step that already finished", () => {
    let s = bootReducer(initialBootState(0), { ...log("discovery.verified", { block: 1, members: 10, ms: 5 }), at: 10 } as BootAction);
    s = bootReducer(s, { ...log("discovery.failed", {}, "warn"), at: 600_010 } as BootAction);
    expect(s.steps.discovery.status).toBe("done");
    expect(s.steps.discovery.endedAt).toBe(10);
    expect(s.later).toEqual([expect.objectContaining({ kind: "recheck", status: "warn" })]);
  });

  it("reads per-phase request timings from the worker's request.timing log", () => {
    const line = parseWorkerLog({
      level: "debug",
      args: ["nox-worker", "request.timing", { totalMs: 900, uploadMs: 300, waitMs: 0, claimMs: 400, downloadMs: 150, decodeMs: 6, claimBytes: 32_310, format: "binary" }],
    });
    expect(requestTiming(line, 42)).toEqual({
      at: 42,
      totalMs: 900,
      uploadMs: 300,
      waitMs: 0,
      claimMs: 400,
      downloadMs: 150,
      decodeMs: 6,
      claimBytes: 32_310,
      format: "binary",
    });
    expect(requestTiming(parseWorkerLog({ level: "info", args: ["nox-worker", "ready", {}] }), 1)).toBeNull();
  });

  it("records the worker's TLS setting from boot.tls", () => {
    expect(initialBootState(0).tls).toBeNull();
    const s = bootReducer(initialBootState(0), log("boot.tls", { mode: "required", session: "per-call", roots: 146 }));
    expect(s.tls).toEqual({ mode: "required", session: "per-call", roots: 146 });
  });

  it("names the transport of a call from the TLS setting, the URL and the worker's log", () => {
    const required = { mode: "required", session: "per-call", roots: 146 };
    const https = "https://sepolia-rollup.arbitrum.io/rpc";
    expect(callTransport(null, https, [])).toBeNull();
    expect(callTransport(required, https, [])).toBe("tls-tunnel");
    expect(callTransport({ ...required, mode: "off" }, https, [])).toBe("exit-http");
    expect(callTransport({ ...required, mode: "preferred" }, https, [])).toBe("tls-tunnel");
    expect(callTransport({ ...required, mode: "preferred" }, https, [{ at: 5, kind: "fallback" }])).toBe("exit-http");
    expect(callTransport({ ...required, mode: "preferred" }, "http://rpc.example/", [])).toBe("exit-http");
    expect(callTransport(required, https, [{ at: 5, kind: "local" }])).toBe("local");

    expect(tunnelEligible("https://rpc.example/key")).toBe(true);
    expect(tunnelEligible("https://rpc.example:443/")).toBe(true);
    expect(tunnelEligible("https://rpc.example:8443/")).toBe(false);
    expect(tunnelEligible("https://10.0.0.1/")).toBe(false);
    expect(tunnelEligible("https://[::1]/")).toBe(false);
    expect(tunnelEligible("http://rpc.example/")).toBe(false);
    expect(tunnelEligible("not a url")).toBe(false);

    const line = (event: string, fields: Record<string, unknown>) => parseWorkerLog({ level: "info", args: ["nox-worker", event, fields] });
    expect(transportEvent(line("tls.fallback", { reason: "no-tunnel-exit" }), 7)).toEqual({ at: 7, kind: "fallback" });
    expect(transportEvent(line("call.done", { seq: 2, outcome: "ok", local: "chain-id" }), 8)).toEqual({ at: 8, kind: "local" });
    expect(transportEvent(line("call.done", { seq: 3, outcome: "ok" }), 9)).toBeNull();
    expect(transportEvent(line("request.timing", { totalMs: 5 }), 9)).toBeNull();
  });

  it("keeps non-Nox log lines as text", () => {
    const l = parseWorkerLog({ level: "bogus", args: ["hello", 1, new Uint8Array(4)] });
    expect(l).toMatchObject({ level: "info", event: "", text: "hello 1 <4 bytes>" });
    const n = parseWorkerLog({ level: "warn", args: ["nox-worker", "entry.switch", { to: "abc", nested: { x: 1 } }] });
    expect(n.fields).toEqual({ to: "abc" });
    expect(n.text).toBe("entry.switch to=abc");
  });
});

describe("entries", () => {
  it("names a default anchor from the worker's certhash label", () => {
    const parts = parseKpsAddress(DEFAULT_ENTRIES[1].address);
    const label = `${parts?.certhash.slice(0, 12)}…`;
    expect(resolveEntry(label)).toMatchObject({ name: "nox-2", parts: { host: "3.232.137.146", port: 15005 } });
    expect(resolveEntry("uUnknown1234…").name).toBeNull();
  });

  it("parses KPS addresses, IPv6 included", () => {
    expect(parseKpsAddress("[2001:db8::1]:15005:uEiAbc")).toMatchObject({ host: "[2001:db8::1]", port: 15005 });
    expect(parseKpsAddress("nox.example:15005:uEiAbc")).toBeNull();
    expect(parseKpsAddress("1.2.3.4:70000:uEiAbc")).toBeNull();
  });

  it("collects gateways and bridges from a worker config", () => {
    const entries = configEntries({ gateways: ["203.0.113.9:15005:uEiQQ"], bridges: ["bad", "198.51.100.1:15005:uEiRR"] });
    expect(entries.map((e) => e.name)).toEqual(["bridge 2", "gateway 1"]);
    expect(resolveEntry("uEiRR", entries).name).toBe("bridge 2");
    expect(configEntries(undefined)).toEqual([]);
  });
});

describe("errors", () => {
  it("keeps the worker's code and adds a hint", () => {
    const failed = Object.assign(new Error("boom"), { name: "WorkerFailedError", code: "wasm-blocked" });
    expect(describeError(failed)).toMatchObject({ code: "wasm-blocked", hint: expect.stringContaining("wasm-unsafe-eval") });
    const call = Object.assign(new Error("late"), { name: "NoxWorkerError", code: "timeout" });
    expect(describeError(call).hint).toMatch(/deadline/);
    expect(describeError("plain").code).toBeNull();
    expect(hintForFailedCode("snapshot-stale")).toMatch(/newer bundle/);
    expect(hintForFailedCode(null)).toBe("");
  });
});

describe("wallet calls", () => {
  const inputs = {
    address: "0x6774cA4baf6FFF84F02898a3DeE4299ed1f5aB4E",
    token: { address: "0x0F69cf1c9F4FF72471701036dd789c934458e630", symbol: "SOKA", decimals: 18 },
  };

  it("builds a five-call batch with distinct ids", () => {
    const batch = buildRequest("batch", inputs);
    expect(Array.isArray(batch)).toBe(true);
    const ids = (batch as { id: number }[]).map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
    const erc20 = buildRequest("erc20", inputs) as unknown as { params: [{ data: string }] };
    expect(erc20.params[0].data.startsWith("0x70a08231")).toBe(true);
  });

  it("orders batch replies by id and surfaces RPC errors", () => {
    const req = buildRequest("batch", inputs) as { id: number }[];
    const reply = [...req].reverse().map((r) => ({ jsonrpc: "2.0", id: r.id, result: `0x${r.id}` }));
    expect(extractValues(req as never, reply)).toEqual(["0x1", "0x2", "0x3", "0x4", "0x5"]);
    expect(() => extractValues(req as never, { error: { message: "batch not allowed" } })).toThrow(/batch refused/);
    expect(() => extractValues(buildRequest("chainId", inputs), { error: { code: -32000, message: "nope" } })).toThrow(/nope/);
  });

  it("summarizes results for people", () => {
    expect(summarize("chainId", ["0x66eee"], inputs)).toBe("421614 (0x66eee)");
    expect(summarize("balance", ["0xde0b6b3a7640000"], inputs)).toBe("1 ETH");
    expect(formatUnits(1_500_000n, 6)).toBe("1.5");
    expect(formatUnits(0n, 18)).toBe("0");
  });

  it("runs a call over any fetch and times it", async () => {
    let t = 0;
    const result = await runCall(
      async () => jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x10" }),
      "https://rpc",
      "blockNumber",
      inputs,
      { now: () => (t += 100) },
    );
    expect(result.summary).toBe("#16");
    expect(result.ms).toBe(100);
    await expect(runCall(async () => jsonResponse({}, 503), "https://rpc", "chainId", inputs)).rejects.toMatchObject({ code: "http-error" });
  });

  it("treats nearby blocks as the same chain view", () => {
    expect(compareValues("chainId", ["0x1"], ["0x1"])).toBe("same");
    expect(compareValues("blockNumber", ["0x100"], ["0x105"])).toBe("close");
    expect(compareValues("blockNumber", ["0x100"], ["0x100000"])).toBe("different");
    expect(compareValues("batch", ["0x1", "0x100", "0x0"], ["0x1", "0x101", "0x1"])).toBe("close");
    expect(compareValues("batch", ["0x1", "0x100"], ["0x2", "0x100"])).toBe("different");
    expect(compareValues("balance", ["0x1"], ["0x2"])).toBe("different");
  });
});
