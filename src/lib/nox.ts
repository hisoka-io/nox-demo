import { NoxClient } from "@hisoka-io/nox-client";
import { kpsClientConfig, kpsSupported } from "@/lib/kps";
import { NOX_REGISTRY_ADDRESS, NOX_RPC_URL, NOX_SEED_URL } from "@/lib/network";

/** How the Explorer reaches its mixnet entry. */
export type NoxTransportKind = "kps" | "classic";

export interface TransportInfo {
  kind: NoxTransportKind;
  /** Why KPS was not used, when the client fell back to classic. */
  fallbackReason: string | null;
}

/** Bound on the KPS boot (three entries are dialled at once, each bounded at 10 s); past it the client falls back to classic. */
export const KPS_BOOT_DEADLINE_MS = 15_000;

/** Bound on one classic-mode attempt (HTTPS ingress plus a WebSocket for replies). */
export const CLASSIC_TIMEOUT_MS = 30_000;

/**
 * Bound on the whole classic boot (seed topology, one batched registry check,
 * WASM, WebSocket). It measures about 2 s, 4 s with a cold seed; past the bound
 * the page shows the error with its Retry button instead of spinning.
 */
export const CLASSIC_CONNECT_DEADLINE_MS = 20_000;

let instance: NoxClient | null = null;
let connecting: Promise<NoxClient> | null = null;
let transport: TransportInfo | null = null;

function describe(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return typeof code === "string" && code.length > 0 && !message.includes(code) ? `${code}: ${message}` : message;
}

/**
 * Races `pending` against a deadline. A client that connects after the
 * deadline is disconnected, since the caller has already moved on.
 */
async function withDeadline(pending: Promise<NoxClient>, ms: number, what: string): Promise<NoxClient> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`${what} did not finish within ${ms} ms`));
    }, ms);
  });
  pending.then(
    (late) => {
      if (timedOut) late.disconnect();
    },
    () => {},
  );
  try {
    return await Promise.race([pending, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** KPS boot bounded by `KPS_BOOT_DEADLINE_MS`; the caller falls back to classic past it. */
function connectKps(): Promise<NoxClient> {
  return withDeadline(NoxClient.connect(kpsClientConfig()), KPS_BOOT_DEADLINE_MS, "KPS boot");
}

/** Classic boot (HTTPS entry) bounded by `CLASSIC_CONNECT_DEADLINE_MS`. */
function connectClassic(): Promise<NoxClient> {
  return withDeadline(
    NoxClient.connect({
      seeds: [NOX_SEED_URL],
      ethRpcUrl: NOX_RPC_URL,
      registryAddress: NOX_REGISTRY_ADDRESS,
      timeoutMs: CLASSIC_TIMEOUT_MS,
    }),
    CLASSIC_CONNECT_DEADLINE_MS,
    "Classic (HTTPS entry) connect",
  );
}

/**
 * KPS mode first (WebRTC to a pinned entry: no seed, no chain RPC); classic
 * mode (HTTPS ingress) when this browser has no WebRTC or the KPS boot fails,
 * for example with `TOPOLOGY_STALE` once the pinned node set is superseded.
 */
async function connect(): Promise<NoxClient> {
  let reason: string;
  if (kpsSupported()) {
    try {
      const client = await connectKps();
      transport = { kind: "kps", fallbackReason: null };
      return client;
    } catch (error) {
      reason = describe(error);
    }
  } else {
    reason = "this browser has no WebRTC (RTCPeerConnection)";
  }
  console.warn(`[nox] KPS entry unavailable (${reason}); using the classic HTTPS entry`);
  const client = await connectClassic();
  transport = { kind: "classic", fallbackReason: reason };
  return client;
}

export async function getClient(): Promise<NoxClient> {
  if (instance) return instance;
  if (connecting) return connecting;

  connecting = connect();

  try {
    instance = await connecting;
    return instance;
  } finally {
    connecting = null;
  }
}

export function disconnectClient() {
  if (instance) {
    instance.disconnect();
    instance = null;
    transport = null;
  }
}

export function isConnected(): boolean {
  return instance !== null;
}

/** The connected client's transport, or null before it connects. */
export function getTransport(): TransportInfo | null {
  return instance ? transport : null;
}
