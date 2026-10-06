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

export interface BootState {
  t0: number;
  steps: Record<StepId, Step>;
  /** Certhash label of the entry the worker reports (first 12 characters + "…"). */
  entryLabel: string | null;
  entryDialMs: number | null;
  members: number | null;
  retries: number;
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
  return { t0: at, steps, entryLabel: null, entryDialMs: null, members: null, retries: 0, failure: null };
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

function setStep(state: BootState, id: StepId, status: StepStatus, at: number, detail?: string): BootState {
  const prev = state.steps[id];
  const startedAt = prev.startedAt ?? at;
  const terminal = status === "done" || status === "failed" || status === "skipped" || status === "warn";
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
    case "kps.dial.failed":
      return {
        ...setStep(state, "dial", state.steps.dial.status === "done" ? "done" : "active", at, `${str(f.anchor ?? f.entry)} ${str(f.code)}, trying the next entry`),
        retries: state.retries + 1,
      };
    case "boot.retry":
      return {
        ...setStep(state, "dial", state.steps.dial.status === "done" ? "done" : "active", at, `retry ${str(f.attempt)} (${str(f.code)}) in ${str(f.delayMs)} ms`),
        retries: state.retries + 1,
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
    case "discovery.verified":
      return setStep(state, "discovery", "done", at, `block ${str(f.block)}, ${str(f.members)} members, agreed in ${str(f.ms)} ms`);
    case "discovery.disagreement":
    case "discovery.incomplete":
    case "discovery.failed":
    case "discovery.rejected":
      return setStep(state, "discovery", "warn", at, `${log.event.slice("discovery.".length)}: running on the pinned snapshot floor`);
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

export function stepDuration(step: Step): number | null {
  if (step.startedAt === undefined || step.endedAt === undefined) return null;
  return Math.max(0, Math.round(step.endedAt - step.startedAt));
}
