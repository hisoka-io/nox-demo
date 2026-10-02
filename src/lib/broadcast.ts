// Decodes the exit node's reply to BroadcastSignedTransaction.
//
// The exit answers in one of three shapes:
//   - "tx_error:<message>" (UTF-8) when the broadcast was rejected or timed out
//   - 32 raw bytes (the tx hash) on the default route
//   - the JSON-serialised RPC result (e.g. "\"0x…\"") when a custom RPC URL was used
// Anything else is reported as an error rather than shown as a hash.

export type BroadcastResult =
  | { ok: true; hash: `0x${string}` }
  | { ok: false; error: string };

const TX_ERROR_PREFIX = "tx_error:";
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function toHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function hashFromJson(value: unknown): `0x${string}` | null {
  if (typeof value === "string" && HASH_RE.test(value)) return value.toLowerCase() as `0x${string}`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("result" in obj) return hashFromJson(obj.result);
  }
  return null;
}

function errorFromJson(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const err = (value as Record<string, unknown>).error;
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err === "object" && typeof (err as Record<string, unknown>).message === "string") {
    return (err as Record<string, string>).message;
  }
  return JSON.stringify(err);
}

export function parseBroadcastResponse(bytes: Uint8Array): BroadcastResult {
  if (bytes.length === 0) {
    return { ok: false, error: "Exit node returned an empty response" };
  }

  const text = decodeUtf8(bytes);

  // Errors first: an error message can be any length, including 32 bytes.
  if (text !== null && text.startsWith(TX_ERROR_PREFIX)) {
    const msg = text.slice(TX_ERROR_PREFIX.length).trim();
    return { ok: false, error: msg || "Broadcast rejected by the exit node" };
  }

  if (text !== null) {
    const trimmed = text.trim();

    // Custom RPC URL route: JSON-serialised RPC result.
    if (trimmed.startsWith("\"") || trimmed.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        const hash = hashFromJson(parsed);
        if (hash) return { ok: true, hash };
        const rpcError = errorFromJson(parsed);
        if (rpcError) return { ok: false, error: rpcError };
        return { ok: false, error: `Unexpected RPC result: ${trimmed.slice(0, 120)}` };
      } catch {
        // fall through
      }
    }

    // Bare hex hash, with or without 0x.
    const bare = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
    if (HASH_RE.test(bare)) return { ok: true, hash: bare.toLowerCase() as `0x${string}` };
  }

  // Default route: the 32-byte hash itself.
  if (bytes.length === 32) return { ok: true, hash: toHex(bytes) };

  const preview = text !== null ? `: ${text.slice(0, 120)}` : "";
  return { ok: false, error: `Unrecognised broadcast response (${bytes.length} bytes)${preview}` };
}

/** Parses a 0x-prefixed hex string into bytes. Returns null when the input is not valid hex. */
export function parseSignedTxHex(input: string): Uint8Array | null {
  const trimmed = input.trim();
  if (!/^0x([0-9a-fA-F]{2})+$/.test(trimmed)) return null;
  const hex = trimmed.slice(2);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
