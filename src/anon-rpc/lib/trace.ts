// Per-call trace: where one wallet call's time went, rebuilt from the worker's
// own log lines (SPEC §13 "nox-worker" entries).
//
// Most of these lines are logged at debug (`tls.open`, `claim.ok`,
// `call.done`), so the page turns the trace on by booting with
// `logLevel: "debug"`. `tls.retry`, `tls.reject`, `tls.fallback` and
// `request.timing` are logged at info. A worker that logs `tls.call` (one line
// per tunnel call: path, open, spare age, exchange, retries) is used as is;
// older workers have the path inferred from the other lines.

import type { CallTransport, LogFields, WorkerLog } from "./timeline";

/** Worker events a call trace is built from. */
export const TRACE_EVENTS: ReadonlySet<string> = new Set([
  "tls.open",
  "tls.retry",
  "tls.reject",
  "tls.fallback",
  "tls.call",
  "claim.ok",
  "claim.recovered",
  "call.done",
  "request.timing",
]);

export interface TraceEvent {
  at: number;
  event: string;
  fields: LogFields;
}

/** The log line as a trace event, or null when traces do not use it. */
export function traceEvent(log: WorkerLog, at: number): TraceEvent | null {
  return TRACE_EVENTS.has(log.event) ? { at, event: log.event, fields: log.fields } : null;
}

/**
 * How the call reached the RPC provider:
 * - `spare`: on a TLS session opened before the call;
 * - `inline`: the call opened its own TLS session first;
 * - `waited`: the call waited for a session another open had started;
 * - `retry`: the first tunnel attempt was lost and the call ran again on a new one;
 * - `exit-http`: an exit HTTP request (no tunnel);
 * - `local`: answered in the worker, nothing sent.
 */
export type TracePath = "spare" | "inline" | "waited" | "retry" | "exit-http" | "local";

const TLS_CALL_PATHS: ReadonlySet<string> = new Set(["spare", "inline", "waited", "retry"]);

export type SegmentKind = "open" | "lost" | "exchange" | "upload" | "wait" | "claim" | "download" | "decode" | "worker" | "page";

export interface TraceSegment {
  kind: SegmentKind;
  ms: number;
}

export interface CallTrace {
  /** Null when the logs do not say (a worker logging above debug). */
  path: TracePath | null;
  /** Page-measured duration, from the call's start to its result. */
  totalMs: number;
  /** The worker's own duration (`call.done` ms). */
  workerMs: number | null;
  /** Time spent opening a TLS session on the call's path (spares excluded). */
  openMs: number | null;
  /** The tunnel exchange that answered (request out, response back). */
  exchangeMs: number | null;
  /** Age of the spare the call used, when the worker reports it (`tls.call`). */
  spareAgeMs: number | null;
  retries: number;
  /** `tls.reject` codes seen while the call ran. */
  rejects: string[];
  /** Durations of the reply claims (`claim.ok` / `claim.recovered` ms). */
  claimsMs: number[];
  /** Ordered parts of `totalMs`; empty when the worker did not log `call.done`. */
  segments: TraceSegment[];
  /** Page and harness overhead: `totalMs` less `workerMs`. */
  pageMs: number | null;
  /** Whether the path came from the worker's `tls.call` line or was inferred. */
  source: "tls.call" | "inferred";
}

export interface CallWindow {
  startedAt: number;
  endedAt: number;
  /** The call's transport from `callTransport`, or null when unknown. */
  transport: CallTransport | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegative(ms: number): number {
  return Math.max(0, Math.round(ms));
}

/**
 * The trace of one call from the trace events logged between its start and a
 * short slack after its end. Events after the call's `call.done` belong to the
 * next call (the worker's log is one ordered stream) and are ignored.
 */
export function buildCallTrace(events: readonly TraceEvent[], call: CallWindow): CallTrace {
  const own: TraceEvent[] = [];
  for (const e of events) {
    if (e.at < call.startedAt) continue;
    own.push(e);
    if (e.event === "call.done") break;
  }
  const done = own.find((e) => e.event === "call.done") ?? null;
  const tlsCall = [...own].reverse().find((e) => e.event === "tls.call") ?? null;
  const timing = [...own].reverse().find((e) => e.event === "request.timing") ?? null;
  const retryEvents = own.filter((e) => e.event === "tls.retry");
  const inlineOpens = own.filter((e) => e.event === "tls.open" && e.fields.spare !== true);
  const rejects = own.filter((e) => e.event === "tls.reject").map((e) => String(e.fields.code ?? "unknown"));
  const claimsMs = own
    .filter((e) => e.event === "claim.ok" || e.event === "claim.recovered")
    .map((e) => num(e.fields.ms))
    .filter((ms): ms is number => ms !== null);

  const totalMs = nonNegative(call.endedAt - call.startedAt);
  const workerMs = done ? num(done.fields.ms) : null;
  const local = done !== null && typeof done.fields.local === "string";
  const retries = tlsCall ? (num(tlsCall.fields.retries) ?? retryEvents.length) : retryEvents.length;

  let path: TracePath | null;
  let source: CallTrace["source"] = "inferred";
  const loggedPath = tlsCall ? String(tlsCall.fields.path ?? "") : "";
  if (TLS_CALL_PATHS.has(loggedPath)) {
    path = loggedPath as TracePath;
    source = "tls.call";
  } else if (local) path = "local";
  else if (call.transport === "exit-http" || call.transport === "local") path = call.transport;
  else if (retries > 0) path = "retry";
  // Spare and inline tell apart only on debug lines: `call.done` shows they were logged.
  else if (done === null) path = null;
  else if (inlineOpens.length > 0) path = "inline";
  else if (call.transport === "tls-tunnel") path = "spare";
  else path = null;

  const inlineOpenMs = inlineOpens.reduce((sum, e) => sum + (num(e.fields.ms) ?? 0), 0);
  const openMs = tlsCall ? num(tlsCall.fields.openMs) : inlineOpens.length > 0 ? inlineOpenMs : path === "spare" ? 0 : null;
  const spareAgeMs = tlsCall ? num(tlsCall.fields.spareAgeMs) : null;

  const segments: TraceSegment[] = [];
  let exchangeMs: number | null = tlsCall ? num(tlsCall.fields.exchangeMs) : null;
  if (workerMs !== null) {
    if (path === "local") {
      segments.push({ kind: "worker", ms: nonNegative(workerMs) });
    } else if (path === "exit-http" && timing !== null) {
      const f = timing.fields;
      const parts: [SegmentKind, number | null][] = [
        ["upload", num(f.uploadMs)],
        ["wait", num(f.waitMs)],
        ["claim", num(f.claimMs)],
        ["download", num(f.downloadMs)],
        ["decode", num(f.decodeMs)],
      ];
      for (const [kind, ms] of parts) if (ms !== null) segments.push({ kind, ms: nonNegative(ms) });
      const rest = workerMs - (num(f.totalMs) ?? 0);
      if (rest > 0) segments.push({ kind: "worker", ms: nonNegative(rest) });
    } else if (path !== null && path !== "exit-http") {
      const open = openMs ?? 0;
      let lost = 0;
      if (retries > 0) {
        if (exchangeMs !== null) {
          lost = workerMs - open - exchangeMs;
        } else if (retryEvents.length > 0) {
          // The first attempt ran from the call's start to its `tls.retry`, less its own open.
          const retryAt = retryEvents[0]!.at;
          const openedBefore = inlineOpens.filter((e) => e.at <= retryAt).reduce((sum, e) => sum + (num(e.fields.ms) ?? 0), 0);
          lost = retryAt - call.startedAt - openedBefore;
        }
      }
      lost = nonNegative(Math.min(lost, workerMs - open));
      const exchange = exchangeMs ?? workerMs - open - lost;
      exchangeMs = nonNegative(exchange);
      if (open > 0) segments.push({ kind: "open", ms: nonNegative(open) });
      if (lost > 0) segments.push({ kind: "lost", ms: lost });
      segments.push({ kind: "exchange", ms: exchangeMs });
      const rest = workerMs - open - lost - exchangeMs;
      if (rest > 0) segments.push({ kind: "worker", ms: nonNegative(rest) });
    } else {
      segments.push({ kind: "worker", ms: nonNegative(workerMs) });
    }
  }
  const pageMs = workerMs === null ? null : nonNegative(totalMs - workerMs);
  if (pageMs !== null && pageMs > 0) segments.push({ kind: "page", ms: pageMs });

  return {
    path,
    totalMs,
    workerMs,
    openMs: openMs === null ? null : nonNegative(openMs),
    exchangeMs,
    spareAgeMs,
    retries,
    rejects,
    claimsMs,
    segments,
    pageMs,
    source,
  };
}

/** Nearest-rank quantile of `values` (0..1), or null when empty. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(q * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

export interface TraceSummary {
  calls: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  paths: Partial<Record<TracePath, number>>;
  retries: number;
  /** Median of each segment kind over the calls that had it. */
  segmentP50: Partial<Record<SegmentKind, number>>;
}

export function summarizeTraces(traces: readonly CallTrace[]): TraceSummary {
  const totals = traces.map((t) => t.totalMs);
  const paths: Partial<Record<TracePath, number>> = {};
  const bySegment = new Map<SegmentKind, number[]>();
  let retries = 0;
  for (const t of traces) {
    if (t.path !== null) paths[t.path] = (paths[t.path] ?? 0) + 1;
    retries += t.retries;
    for (const s of t.segments) {
      const list = bySegment.get(s.kind) ?? [];
      list.push(s.ms);
      bySegment.set(s.kind, list);
    }
  }
  const segmentP50: Partial<Record<SegmentKind, number>> = {};
  for (const [kind, list] of bySegment) segmentP50[kind] = quantile(list, 0.5)!;
  return {
    calls: traces.length,
    p50Ms: quantile(totals, 0.5),
    p95Ms: quantile(totals, 0.95),
    maxMs: totals.length === 0 ? null : Math.max(...totals),
    paths,
    retries,
    segmentP50,
  };
}

/** Whether a boot config turns on the debug lines the trace needs. */
export function traceLogging(config: unknown): boolean {
  return typeof config === "object" && config !== null && !Array.isArray(config) && (config as { logLevel?: unknown }).logLevel === "debug";
}

/**
 * The boot config with `logLevel: "debug"` set, for the page's trace toggle.
 * An empty config becomes `{ logLevel: "debug" }`; a config that is not an
 * object is returned unchanged so the worker reports it as invalid.
 */
export function withTraceLogging(config: unknown): unknown {
  if (config === undefined) return { logLevel: "debug" };
  if (typeof config !== "object" || config === null || Array.isArray(config)) return config;
  return { ...(config as Record<string, unknown>), logLevel: "debug" };
}
