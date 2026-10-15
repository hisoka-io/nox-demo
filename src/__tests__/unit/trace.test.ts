import { describe, expect, it } from "vitest";
import { parseWorkerLog, type LogFields } from "@/anon-rpc/lib/timeline";
import {
  buildCallTrace,
  quantile,
  summarizeTraces,
  traceEvent,
  traceLogging,
  withTraceLogging,
  type CallWindow,
  type TraceEvent,
} from "@/anon-rpc/lib/trace";

/**
 * Worker log lines as the page's log drawer shows them, `<ms since the call
 * started> <event> k=v …`, copied from live India profiles of worker 0.4.0
 * and 0.3.0 on 2026-10-15 (debug log level).
 */
function events(lines: readonly string[]): TraceEvent[] {
  const out: TraceEvent[] = [];
  for (const line of lines) {
    const [at, event, ...pairs] = line.trim().split(/\s+/);
    const fields: LogFields = {};
    for (const pair of pairs) {
      const eq = pair.indexOf("=");
      const key = pair.slice(0, eq);
      const raw = pair.slice(eq + 1);
      fields[key] = raw === "true" ? true : raw === "false" ? false : raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    }
    // Through the page's own parser, as the hook does.
    const log = parseWorkerLog({ level: "debug", args: ["nox-worker", event, fields] });
    const traced = traceEvent(log, Number(at));
    if (traced !== null) out.push(traced);
  }
  return out;
}

const tunnel = (endedAt: number): CallWindow => ({ startedAt: 0, endedAt, transport: "tls-tunnel" });

describe("call trace from worker logs", () => {
  it("a call on a spare session is all exchange", () => {
    // ab-gap1 v040-tls call 1 (828 ms)
    const trace = buildCallTrace(
      events([
        "813 claim.ok entry=uEiDGVPDwsQ9… ids=2 items=1 reclaimed=0 bytes=32346 format=binary ms=779",
        "819 call.done seq=2 jsonrpcMethod=eth_getBalance bytesOut=115 bytesIn=55 ms=788 outcome=ok",
      ]),
      tunnel(828),
    );
    expect(trace.path).toBe("spare");
    expect(trace.openMs).toBe(0);
    expect(trace.exchangeMs).toBe(788);
    expect(trace.pageMs).toBe(40);
    expect(trace.claimsMs).toEqual([779]);
    expect(trace.segments).toEqual([
      { kind: "exchange", ms: 788 },
      { kind: "page", ms: 40 },
    ]);
  });

  it("a call that opened its own session shows the open before the exchange", () => {
    // ab-gap15 v040-tls call 0 (1668 ms, the first call after boot)
    const trace = buildCallTrace(
      events([
        "906 claim.ok entry=uEiDGVPDwsQ9… ids=2 items=1 reclaimed=0 bytes=32346 format=binary ms=816",
        "974 tls.open tunnel=99e90433 ms=916 cpuMs=64.7 protocol=TLSv1_3 spare=false",
        "1627 claim.ok entry=uEiDGVPDwsQ9… ids=2 items=1 reclaimed=0 bytes=32346 format=binary ms=641",
        "1641 call.done seq=1 jsonrpcMethod=eth_getBalance bytesOut=115 bytesIn=55 ms=1597 outcome=ok",
      ]),
      tunnel(1668),
    );
    expect(trace.path).toBe("inline");
    expect(trace.openMs).toBe(916);
    expect(trace.exchangeMs).toBe(681);
    expect(trace.segments.map((s) => s.kind)).toEqual(["open", "exchange", "page"]);
    expect(trace.segments.reduce((sum, s) => sum + s.ms, 0)).toBe(1668);
  });

  it("a retried call counts the lost attempt and ignores the next spare's open", () => {
    // ab-gap15 v040-tls call 4 (1620 ms): the spare's upstream had closed
    const trace = buildCallTrace(
      events([
        "591 claim.ok entry=uEiDGVPDwsQ9… ids=2 items=1 reclaimed=0 bytes=32346 format=binary ms=562",
        "596 tls.retry reason=TunnelRejectedError",
        "1029 claim.ok entry=uEiCStd3rfGT… ids=2 items=1 reclaimed=0 bytes=32346 format=binary ms=429",
        "1044 tls.open tunnel=dff52f11 ms=448 cpuMs=12.9 protocol=TLSv1_3 spare=false",
        "1507 claim.ok entry=uEiDGVPDwsQ9… ids=2 items=1 reclaimed=0 bytes=32346 format=binary ms=567",
        "1522 tls.open tunnel=d8a4bfa9 ms=586 cpuMs=12.8 protocol=TLSv1_3 spare=true",
        "1613 claim.ok entry=uEiCStd3rfGT… ids=2 items=1 reclaimed=0 bytes=32346 format=binary ms=565",
        "1619 call.done seq=5 jsonrpcMethod=eth_getBalance bytesOut=115 bytesIn=55 ms=1593 outcome=ok",
      ]),
      tunnel(1620),
    );
    expect(trace.path).toBe("retry");
    expect(trace.retries).toBe(1);
    expect(trace.openMs).toBe(448);
    expect(trace.segments).toEqual([
      { kind: "open", ms: 448 },
      { kind: "lost", ms: 596 },
      { kind: "exchange", ms: 549 },
      { kind: "page", ms: 27 },
    ]);
  });

  it("an exit HTTP call is split into the request.timing phases", () => {
    // ab-gap1 v040-off call 0 (531 ms, TLS off)
    const trace = buildCallTrace(
      events([
        "519 claim.ok entry=uEiBVDwIs40b… ids=2 items=1 reclaimed=0 bytes=32346 format=binary ms=501",
        "521 request.timing totalMs=508 replyBytes=489 claims=1 uploadMs=290 waitMs=0 claimMs=499 downloadMs=2 decodeMs=3 claimBytes=32346 format=binary",
        "523 call.done seq=1 jsonrpcMethod=eth_getBalance bytesOut=115 bytesIn=55 ms=509 outcome=ok",
      ]),
      { startedAt: 0, endedAt: 531, transport: "exit-http" },
    );
    expect(trace.path).toBe("exit-http");
    expect(trace.openMs).toBeNull();
    expect(trace.segments).toEqual([
      { kind: "upload", ms: 290 },
      { kind: "wait", ms: 0 },
      { kind: "claim", ms: 499 },
      { kind: "download", ms: 2 },
      { kind: "decode", ms: 3 },
      { kind: "worker", ms: 1 },
      { kind: "page", ms: 22 },
    ]);
  });

  it("stops at the call's call.done: later lines belong to the next call", () => {
    const trace = buildCallTrace(
      events([
        "400 call.done seq=1 jsonrpcMethod=eth_getBalance ms=380 outcome=ok",
        "450 tls.open tunnel=aa ms=500 spare=false",
        "460 tls.retry reason=TunnelRejectedError",
      ]),
      tunnel(410),
    );
    expect(trace.path).toBe("spare");
    expect(trace.retries).toBe(0);
  });

  it("uses the worker's tls.call line when it logs one", () => {
    const trace = buildCallTrace(
      events([
        "700 tls.call path=waited openMs=220 spareAgeMs=0 exchangeMs=480 retries=0",
        "705 call.done seq=3 ms=700 outcome=ok",
      ]),
      tunnel(720),
    );
    expect(trace.source).toBe("tls.call");
    expect(trace.path).toBe("waited");
    expect(trace.segments).toEqual([
      { kind: "open", ms: 220 },
      { kind: "exchange", ms: 480 },
      { kind: "page", ms: 20 },
    ]);
  });

  it("marks a local answer and keeps the path unknown without debug lines", () => {
    const local = buildCallTrace(events(["3 call.done seq=4 jsonrpcMethod=eth_chainId ms=1 outcome=ok local=chainId"]), tunnel(5));
    expect(local.path).toBe("local");
    expect(local.segments).toEqual([
      { kind: "worker", ms: 1 },
      { kind: "page", ms: 4 },
    ]);
    // Info level: no call.done, so spare and inline cannot be told apart.
    const quiet = buildCallTrace([], tunnel(900));
    expect(quiet.path).toBeNull();
    expect(quiet.segments).toEqual([]);
    // A retry is logged at info, so it still shows.
    expect(buildCallTrace(events(["596 tls.retry reason=TunnelRejectedError"]), tunnel(1600)).path).toBe("retry");
  });

  it("keeps only the trace events", () => {
    const log = parseWorkerLog({ level: "info", args: ["nox-worker", "ready", {}] });
    expect(traceEvent(log, 1)).toBeNull();
  });
});

describe("trace summary", () => {
  it("reports nearest-rank p50 and p95 and the path mix", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([5, 1, 3], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100], 0.95)).toBe(19);
    const spare = buildCallTrace(events(["800 call.done seq=1 ms=790 outcome=ok"]), tunnel(800));
    const inline = buildCallTrace(events(["500 tls.open tunnel=a ms=500 spare=false", "1200 call.done seq=2 ms=1190 outcome=ok"]), tunnel(1200));
    const summary = summarizeTraces([spare, spare, inline]);
    expect(summary.calls).toBe(3);
    expect(summary.p50Ms).toBe(800);
    expect(summary.p95Ms).toBe(1200);
    expect(summary.paths).toEqual({ spare: 2, inline: 1 });
    expect(summary.segmentP50.open).toBe(500);
  });
});

describe("trace toggle", () => {
  it("sets logLevel debug and leaves the rest of the config", () => {
    expect(withTraceLogging(undefined)).toEqual({ logLevel: "debug" });
    expect(withTraceLogging({ tls: "off", logLevel: "warn" })).toEqual({ tls: "off", logLevel: "debug" });
    expect(withTraceLogging([1])).toEqual([1]);
    expect(traceLogging(withTraceLogging(undefined))).toBe(true);
    expect(traceLogging(undefined)).toBe(false);
    expect(traceLogging({ logLevel: "info" })).toBe(false);
  });
});
