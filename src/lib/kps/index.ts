// KPS entry settings for the Explorer's mixnet client.
//
// The pinned snapshot and the discovery bootstrap are copied byte for byte
// from @hisoka-io/anon-rpc-worker@0.4.0 (snapshot/). The snapshot's keccak-256
// is in nox-snapshot.json.keccak256, and a unit test keeps the two equal. In
// KPS mode the client trusts only the pinned members, dials an entry over
// WebRTC (no seed, no chain RPC, no WebSocket), and re-checks the registry
// through the mixnet in the background.

import {
  DISCOVERY_FIRST_CHECK_MAX_DEFER_MS,
  RESEND_FAST,
  verifyBootstrap,
  verifyPinnedSnapshot,
  type KpsConnLike,
  type KpsDial,
  type NoxClientConfig,
  type NoxWasmBindings,
  type PinnedSnapshot,
} from "@hisoka-io/nox-client";
import { dial } from "@kpstreams/webrtc-client";
import snapshot from "./nox-snapshot.json";
import bootstrapFile from "./nox-bootstrap.json";

/** Bound on one mixnet attempt in KPS mode (the anon-rpc worker's `attemptTimeoutMs` default). */
export const KPS_ATTEMPT_TIMEOUT_MS = 12_000;

/** Send a second copy on another route when no reply came after this long (the worker's `hedgeAfterMs` default). */
export const KPS_HEDGE_AFTER_MS = 3_000;

/** Whether this browser can dial a KPS entry (WebRTC data channels). */
export function kpsSupported(): boolean {
  return typeof (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection === "function";
}

/**
 * KPS mode takes its WASM bindings from the caller (it never loads WASM on its
 * own); this is the same lazy load classic mode does by itself.
 */
async function loadWasm(): Promise<NoxWasmBindings> {
  const mod = await import("@hisoka-io/nox-wasm");
  const init = (mod as { default?: unknown }).default;
  if (typeof init === "function") await (init as () => Promise<unknown>)();
  return mod as unknown as NoxWasmBindings;
}

const kpsDial: KpsDial = (address, opts) => dial(address, opts) as unknown as Promise<KpsConnLike>;

/**
 * `NoxClient.connect` config for KPS mode. Throws when the vendored snapshot
 * or bootstrap fails the client's own checks, so the caller can fall back.
 */
export function kpsClientConfig(): NoxClientConfig {
  const pinned = snapshot as unknown as PinnedSnapshot;
  verifyPinnedSnapshot(pinned);
  const bootstrap = verifyBootstrap(bootstrapFile, pinned);
  return {
    mode: "kps",
    wasm: loadWasm,
    timeoutMs: KPS_ATTEMPT_TIMEOUT_MS,
    resend: { ...RESEND_FAST, hedgeAfterMs: KPS_HEDGE_AFTER_MS },
    kps: {
      dial: kpsDial,
      pinned,
      // Same entry settings as the anon-rpc worker: a warm standby entry, and
      // claims on the primary connection.
      standby: true,
      claimLane: false,
      discovery: { bootstrap, firstCheckDeferMs: DISCOVERY_FIRST_CHECK_MAX_DEFER_MS },
    },
  };
}
