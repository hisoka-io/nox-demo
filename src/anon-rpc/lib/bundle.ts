// SPEC §4.1/§4.2: fetch the worker bundle from a resolver and check its
// keccak-256 against the specifier's hash. Any bytes with the right hash are
// the worker; a resolver is only a location.

import { keccak256, type Hex } from "viem";

/** Same cap as the reference harness (MAX_BUNDLE_BYTES). */
export const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

export type ResolverOutcome =
  | { resolver: string; kind: "ok"; bytes: number; ms: number }
  | { resolver: string; kind: "failed"; reason: string }
  | { resolver: string; kind: "mismatch"; got: Hex }
  /** `kps:` entries: the harness fetches them over its own KPS dialer. */
  | { resolver: string; kind: "harness" };

export interface BundleFetch {
  bytes: Uint8Array | null;
  hash: Hex | null;
  resolver: string | null;
  ms: number;
  outcomes: ResolverOutcome[];
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function bundleHash(bytes: Uint8Array): Hex {
  return keccak256(bytes);
}

export function resolverKind(resolver: string): "http" | "kps" | "other" {
  if (/^https?:\/\//i.test(resolver)) return "http";
  if (resolver.startsWith("kps:")) return "kps";
  return "other";
}

async function readCapped(response: Response, cap: number): Promise<Uint8Array> {
  if (!response.body) {
    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.byteLength > cap) throw new Error(`body exceeds the ${cap}-byte bundle cap`);
    return buf;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`body exceeds the ${cap}-byte bundle cap`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Try the http(s) resolvers in order and return the first bytes whose hash
 * matches. `kps:` entries are left to the harness, which dials them itself.
 */
export async function fetchVerifiedBundle(
  fetchImpl: FetchLike,
  resolvers: readonly string[],
  expectedHash: Hex,
  options: { maxBytes?: number; now?: () => number } = {},
): Promise<BundleFetch> {
  const now = options.now ?? (() => performance.now());
  const cap = options.maxBytes ?? MAX_BUNDLE_BYTES;
  const started = now();
  const outcomes: ResolverOutcome[] = [];
  const want = expectedHash.toLowerCase();
  for (const resolver of resolvers) {
    const kind = resolverKind(resolver);
    if (kind === "kps") {
      outcomes.push({ resolver, kind: "harness" });
      continue;
    }
    if (kind === "other") {
      outcomes.push({ resolver, kind: "failed", reason: "resolver kind this page does not fetch" });
      continue;
    }
    const attempt = now();
    let bytes: Uint8Array;
    try {
      const response = await fetchImpl(resolver, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = await readCapped(response, cap);
    } catch (error) {
      outcomes.push({ resolver, kind: "failed", reason: (error as Error).message });
      continue;
    }
    const got = bundleHash(bytes);
    if (got.toLowerCase() !== want) {
      outcomes.push({ resolver, kind: "mismatch", got });
      continue;
    }
    outcomes.push({ resolver, kind: "ok", bytes: bytes.byteLength, ms: Math.round(now() - attempt) });
    return { bytes, hash: got, resolver, ms: Math.round(now() - started), outcomes };
  }
  return { bytes: null, hash: null, resolver: null, ms: Math.round(now() - started), outcomes };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}
