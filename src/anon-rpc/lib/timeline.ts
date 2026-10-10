// The boot timeline: page steps (specifier read, bundle check) and the steps
// the Nox worker reports through its SPEC §13 log, as
// ("nox-worker", event, fields).

export type StepId = "specifier" | "bundle" | "sandbox" | "wasm" | "dial" | "topology" | "ready" | "discovery";
export type StepStatus = "pending" | "active" | "done" | "warn" | "failed" | "skipped";

export interface Step {
  id: StepId;
  label: string;
  status: StepStatus;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
}

export const STEP_ORDER: readonly StepId[] = [
  "specifier",
  "bundle",
  "sandbox",
  "wasm",
  "dial",
  "topology",
  "ready",
  "discovery",
];

const LABELS: Record<StepId, string> = {
  specifier: "Specifier read",
  bundle: "Bundle download + keccak check",
  sandbox: "Sandboxed worker started",
  wasm: "WebAssembly (Sphinx) ready",
  dial: "KPS dial to an entry",
  topology: "Topology accepted",
  ready: "Worker ready",
  discovery: "Registry check through the mixnet",
};

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | null>;

export interface WorkerLog {
  level: LogLevel;
  event: string;
  fields: LogFields;
  /** One-line text for the log drawer. */
  text: string;
}

/**
 * Something that happened after its boot step had finished: a later registry
 * check (every 600 s), a redial or an entry failover. Shown as its own row so
 * a finished step's duration never grows with wall-clock time.
 */
export interface LaterEvent {
  kind: "recheck" | "connection";
  at: number;
  status: "done" | "warn";
  detail: string;
  /** The event's own duration when the worker reports one (a check's `ms`). */
  ms: number | null;
}

/** How the worker carries wallet calls, as it reports at boot. */
export interface TlsSetting {
  /** "required", "preferred" or "off". */
  mode: string;
  /** "per-call" or "keep-alive". */
  session: string;
  /** Number of Mozilla root certificates compiled into the bundle (webpki-roots). */
  roots: number | null;
}

/** Later events kept (newest last). */
export const LATER_EVENTS_KEPT = 20;

export interface BootState {
  t0: number;
  steps: Record<StepId, Step>;
  later: LaterEvent[];
  /** Certhash label of the entry the worker reports (first 12 characters + "…"). */
  entryLabel: string | null;
  entryDialMs: number | null;
  members: number | null;
  retries: number;
  /** The worker's TLS setting for wallet calls, from its `boot.tls` log (worker 0.4 and later). */
  tls: TlsSetting | null;
  failure: { code: string | null; message: string } | null;
}

export type BootAction =
  | { type: "reset"; at: number }
  | { type: "step"; id: StepId; status: StepStatus; at: number; detail?: string }
  | { type: "log"; at: number; log: WorkerLog }
  | { type: "ready"; at: number }
  | { type: "failed"; at: number; code: string | null; message: string };

export function initialBootState(at = 0): BootState {
  const steps = {} as Record<StepId, Step>;
  for (const id of STEP_ORDER) steps[id] = { id, label: LABELS[id], status: "pending" };
  return { t0: at, steps, later: [], entryLabel: null, entryDialMs: null, members: null, retries: 0, tls: null, failure: null };
}

function isLogLevel(value: unknown): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

function primitive(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function renderArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Uint8Array) return `<${arg.byteLength} bytes>`;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

/**
 * Parse a harness log entry. Nox worker entries become
 * `{ event, fields }`; anything else keeps its text with event "".
 */
export function parseWorkerLog(entry: { level: unknown; args: readonly unknown[] }): WorkerLog {
  const level: LogLevel = isLogLevel(entry.level) ? entry.level : "info";
  const [source, event, rawFields] = entry.args;
  const text = entry.args.map(renderArg).join(" ");
  if (source !== "nox-worker" || typeof event !== "string") return { level, event: "", fields: {}, text };
  const fields: LogFields = {};
  if (rawFields !== null && typeof rawFields === "object" && !Array.isArray(rawFields)) {
    for (const [key, value] of Object.entries(rawFields as Record<string, unknown>)) {
      if (primitive(value)) fields[key] = value;
    }
  }
  const rest = Object.entries(fields)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  return { level, event, fields, text: rest ? `${event} ${rest}` : event };
}

export function isTerminal(status: StepStatus): boolean {
  return status === "done" || status === "failed" || status === "skipped" || status === "warn";
}

/**
 * Set a step's status. A step that already finished keeps its status, timing
 * and detail: later terminal events (a periodic re-check, a redial) are
 * recorded with `later`, never by moving `endedAt`.
 */
function setStep(state: BootState, id: StepId, status: StepStatus, at: number, detail?: string): BootState {
  const prev = state.steps[id];
  const terminal = isTerminal(status);
  if (isTerminal(prev.status) && (terminal || status === "active")) return state;
  const startedAt = prev.startedAt ?? at;
  const next: Step = {
    ...prev,
    status,
    startedAt: status === "pending" ? undefined : startedAt,
    endedAt: terminal ? at : undefined,
    detail: detail ?? prev.detail,
  };
  return { ...state, steps: { ...state.steps, [id]: next } };
}

/** Mark `id` done, first closing any earlier step still running. */
function finishThrough(state: BootState, id: StepId, at: number, detail?: string): BootState {
  let next = state;
  for (const step of STEP_ORDER) {
    if (step === id) break;
    if (step === "discovery") continue;
    if (next.steps[step].status === "active" || next.steps[step].status === "pending") {
      next = setStep(next, step, "done", at);
    }
  }
  return setStep(next, id, "done", at, detail);
}

function activate(state: BootState, id: StepId, at: number, detail?: string): BootState {
  const status = state.steps[id].status;
  if (status === "done" || status === "failed") return state;
  return setStep(state, id, "active", at, detail);
}

function addLater(state: BootState, event: LaterEvent): BootState {
  const later = [...state.later, event];
  return { ...state, later: later.length > LATER_EVENTS_KEPT ? later.slice(later.length - LATER_EVENTS_KEPT) : later };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function applyLog(state: BootState, at: number, log: WorkerLog): BootState {
  const f = log.fields;
  switch (log.event) {
    case "boot.start":
      return activate(finishThrough(state, "sandbox", at), "wasm", at);
    case "boot.snapshot":
      return {
        ...setStep(state, "sandbox", state.steps.sandbox.status, at, `snapshot block ${str(f.block)}, ${str(f.members)} members, ${str(f.anchors)} anchors`),
        members: typeof f.members === "number" ? f.members : state.members,
      };
    case "boot.tls":
      return { ...state, tls: { mode: str(f.mode), session: str(f.session), roots: num(f.roots) } };
    case "boot.wasm":
      return activate(finishThrough(state, "wasm", at, "nox-wasm compiled in the worker"), "dial", at);
    case "anchor.dial":
      return activate(state, "dial", at, `dialing ${str(f.anchor)}`);
    case "kps.dial.ok": {
      const label = str(f.entry);
      const ms = typeof f.ms === "number" ? f.ms : null;
      const dialed = state.steps.dial.status === "done";
      const next = dialed ? state : activate(finishThrough(state, "dial", at, `${label} in ${ms ?? "?"} ms`), "topology", at);
      return {
        ...next,
        entryLabel: next.entryLabel ?? (label || null),
        entryDialMs: next.entryDialMs ?? ms,
      };
    }
    case "anchor.failed":
    case "kps.dial.failed": {
      const detail = `${str(f.anchor ?? f.entry)} ${str(f.code)}, trying the next entry`;
      if (isTerminal(state.steps.dial.status)) {
        return addLater(state, { kind: "connection", at, status: "warn", detail: `redial: ${detail}`, ms: null });
      }
      return { ...setStep(state, "dial", "active", at, detail), retries: state.retries + 1 };
    }
    case "boot.retry":
      return {
        ...setStep(state, "dial", "active", at, `retry ${str(f.attempt)} (${str(f.code)}) in ${str(f.delayMs)} ms`),
        retries: state.retries + 1,
      };
    case "entry.failover":
      return {
        ...addLater(state, { kind: "connection", at, status: "done", detail: `entry ${str(f.from)} closed, moved to standby ${str(f.to)}`, ms: null }),
        entryLabel: str(f.to) || state.entryLabel,
      };
    case "topology.accepted":
      return activate(
        finishThrough(state, "topology", at, `${str(f.members)} members from ${str(f.sources)} source(s)`),
        "ready",
        at,
      );
    case "kps.connected":
      return {
        ...finishThrough(state, "topology", at),
        entryLabel: str(f.entry) || state.entryLabel,
        members: typeof f.members === "number" ? f.members : state.members,
      };
    case "entry.switch":
      return { ...state, entryLabel: str(f.to) || state.entryLabel };
    case "ready":
      return activate(finishThrough(state, "ready", at), "discovery", at, "reading NoxRegistry via 2 exits × 2 providers");
    case "discovery.verified": {
      const detail = `block ${str(f.block)}, ${str(f.members)} members, agreed in ${str(f.ms)} ms`;
      if (isTerminal(state.steps.discovery.status)) {
        return addLater(state, { kind: "recheck", at, status: "done", detail, ms: num(f.ms) });
      }
      return setStep(state, "discovery", "done", at, detail);
    }
    case "discovery.disagreement":
    case "discovery.incomplete":
    case "discovery.failed":
    case "discovery.rejected": {
      const detail = `${log.event.slice("discovery.".length)}: running on the pinned snapshot floor`;
      if (isTerminal(state.steps.discovery.status)) {
        return addLater(state, { kind: "recheck", at, status: "warn", detail, ms: null });
      }
      return setStep(state, "discovery", "warn", at, detail);
    }
    case "worker.failed":
      return { ...state, failure: { code: str(f.code) || null, message: str(f.reason) || "the worker stopped" } };
    default:
      return state;
  }
}

export function bootReducer(state: BootState, action: BootAction): BootState {
  switch (action.type) {
    case "reset":
      return initialBootState(action.at);
    case "step":
      return setStep(state, action.id, action.status, action.at, action.detail);
    case "log":
      return applyLog(state, action.at, action.log);
    case "ready":
      if (state.steps.ready.status === "done") return state;
      return activate(finishThrough(state, "ready", action.at), "discovery", action.at);
    case "failed": {
      let next = state;
      for (const id of STEP_ORDER) {
        if (next.steps[id].status === "active") next = setStep(next, id, "failed", action.at);
      }
      return { ...next, failure: { code: action.code, message: action.message } };
    }
  }
}

/** Per-phase durations of one mixnet request, from the worker's `request.timing` log (worker 0.3 and later, logged at info). */
export interface RequestTiming {
  at: number;
  totalMs: number | null;
  uploadMs: number | null;
  waitMs: number | null;
  claimMs: number | null;
  downloadMs: number | null;
  decodeMs: number | null;
  claimBytes: number | null;
  format: string | null;
}

/** `request.timing` fields as a `RequestTiming`, or null for any other log line. */
export function requestTiming(log: WorkerLog, at: number): RequestTiming | null {
  if (log.event !== "request.timing") return null;
  const f = log.fields;
  return {
    at,
    totalMs: num(f.totalMs),
    uploadMs: num(f.uploadMs),
    waitMs: num(f.waitMs),
    claimMs: num(f.claimMs),
    downloadMs: num(f.downloadMs),
    decodeMs: num(f.decodeMs),
    claimBytes: num(f.claimBytes),
    format: typeof f.format === "string" ? f.format : null,
  };
}

export function stepDuration(step: Step): number | null {
  if (step.startedAt === undefined || step.endedAt === undefined) return null;
  return Math.max(0, Math.round(step.endedAt - step.startedAt));
}

/** How one wallet call travelled between the worker and the RPC provider. */
export type CallTransport = "tls-tunnel" | "exit-http" | "local";

/** A worker log line that says a call left the TLS tunnel path. */
export interface TransportEvent {
  at: number;
  kind: "fallback" | "local";
}

/**
 * `tls.fallback` (info: the call went out as an exit HTTP request) and a
 * `call.done` with `local` (debug: the worker answered from its own verified
 * answers and sent nothing), or null for any other log line.
 */
export function transportEvent(log: WorkerLog, at: number): TransportEvent | null {
  if (log.event === "tls.fallback") return { at, kind: "fallback" };
  if (log.event === "call.done" && typeof log.fields.local === "string") return { at, kind: "local" };
  return null;
}

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** The worker opens tunnels for https on port 443 to a host given by name. */
export function tunnelEligible(rpcUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rpcUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.port !== "" && url.port !== "443") return false;
  return !IPV4_RE.test(url.hostname) && !url.hostname.startsWith("[");
}

/**
 * Transport of a call that succeeded, from the worker's TLS setting, the
 * call's URL and the transport events logged while it ran. Null when the
 * worker reported no TLS setting (worker 0.3 and earlier).
 */
export function callTransport(tls: TlsSetting | null, rpcUrl: string, events: readonly TransportEvent[]): CallTransport | null {
  if (tls === null) return null;
  if (events.some((event) => event.kind === "local")) return "local";
  if (tls.mode !== "required" && tls.mode !== "preferred") return "exit-http";
  if (!tunnelEligible(rpcUrl)) return "exit-http";
  return events.some((event) => event.kind === "fallback") ? "exit-http" : "tls-tunnel";
}
