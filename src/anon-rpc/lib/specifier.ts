// SPEC §4: a worker is named by an on-chain IWorkerSpecifier. Its hash is the
// identity; its resolvers only say where the bytes may be found.
//
// The page reads the specifier itself so it can show each boot step, then
// hands the harness a provider that answers the same two reads from memory.
// The harness still re-hashes the bundle bytes and compares them with the
// on-chain hash before it runs anything.

import { decodeFunctionResult, encodeFunctionResult, toFunctionSelector, type Hex } from "viem";

export const SPECIFIER_ABI = [
  { type: "function", name: "workerHash", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "workerResolvers", stateMutability: "view", inputs: [], outputs: [{ type: "string[]" }] },
] as const;

export const WORKER_HASH_SELECTOR = toFunctionSelector("workerHash()");
export const WORKER_RESOLVERS_SELECTOR = toFunctionSelector("workerResolvers()");

export interface SpecifierRead {
  address: string;
  chainId: number;
  workerHash: Hex;
  resolvers: string[];
  ms: number;
}

/** Minimal EIP-1193 provider, the shape the harness takes (SPEC §5). */
export interface RpcProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export class SpecifierError extends Error {
  readonly code: "rpc-failed" | "wrong-chain" | "not-a-specifier";
  constructor(code: SpecifierError["code"], message: string) {
    super(message);
    this.name = "SpecifierError";
    this.code = code;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function rpcCall(fetchImpl: FetchLike, url: string, method: string, params: unknown[]): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  } catch (error) {
    throw new SpecifierError("rpc-failed", `${method} to ${hostOf(url)} failed: ${(error as Error).message}`);
  }
  if (!response.ok) throw new SpecifierError("rpc-failed", `${method} to ${hostOf(url)} returned HTTP ${response.status}`);
  let body: { result?: unknown; error?: { message?: string } };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new SpecifierError("rpc-failed", `${method} to ${hostOf(url)} returned a body that is not JSON`);
  }
  if (body.error) throw new SpecifierError("rpc-failed", `${method}: ${body.error.message ?? "RPC error"}`);
  return body.result;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Read `workerHash()` and `workerResolvers()` from a specifier, checking that
 * the RPC serves the chain the page expects first.
 */
export async function readSpecifier(
  fetchImpl: FetchLike,
  rpcUrl: string,
  address: string,
  expectedChainId: number,
  now: () => number = () => performance.now(),
): Promise<SpecifierRead> {
  const started = now();
  const [chainHex, hashRet, resolversRet] = await Promise.all([
    rpcCall(fetchImpl, rpcUrl, "eth_chainId", []),
    rpcCall(fetchImpl, rpcUrl, "eth_call", [{ to: address, data: WORKER_HASH_SELECTOR }, "latest"]),
    rpcCall(fetchImpl, rpcUrl, "eth_call", [{ to: address, data: WORKER_RESOLVERS_SELECTOR }, "latest"]),
  ]);
  const chainId = typeof chainHex === "string" ? Number.parseInt(chainHex, 16) : Number.NaN;
  if (chainId !== expectedChainId) {
    throw new SpecifierError(
      "wrong-chain",
      `The specifier RPC serves chain ${Number.isNaN(chainId) ? "?" : chainId}; the page expects ${expectedChainId}`,
    );
  }
  let workerHash: Hex;
  let resolvers: string[];
  try {
    workerHash = decodeFunctionResult({ abi: SPECIFIER_ABI, functionName: "workerHash", data: hashRet as Hex });
    resolvers = [
      ...decodeFunctionResult({ abi: SPECIFIER_ABI, functionName: "workerResolvers", data: resolversRet as Hex }),
    ];
  } catch {
    throw new SpecifierError(
      "not-a-specifier",
      `${address} on chain ${chainId} does not answer workerHash() and workerResolvers()`,
    );
  }
  if (/^0x0{64}$/.test(workerHash)) {
    throw new SpecifierError("not-a-specifier", `${address} on chain ${chainId} has no worker hash set`);
  }
  return { address, chainId, workerHash, resolvers, ms: Math.round(now() - started) };
}

/**
 * A provider that answers the two specifier reads for `address` from memory
 * and refuses everything else, so the harness cannot quietly depend on a chain
 * connection the page did not show.
 */
export function memoryProvider(address: string, workerHash: Hex, resolvers: readonly string[]): RpcProvider {
  const hashRet = encodeFunctionResult({ abi: SPECIFIER_ABI, functionName: "workerHash", result: workerHash });
  const resolversRet = encodeFunctionResult({
    abi: SPECIFIER_ABI,
    functionName: "workerResolvers",
    result: [...resolvers],
  });
  return {
    request: async ({ method, params }) => {
      const call = (params as [{ to?: string; data?: string }] | undefined)?.[0];
      if (method !== "eth_call" || call?.to?.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`anon-rpc page: the harness asked for ${method}, which this page does not forward`);
      }
      const selector = (call.data ?? "").slice(0, 10).toLowerCase();
      if (selector === WORKER_HASH_SELECTOR) return hashRet;
      if (selector === WORKER_RESOLVERS_SELECTOR) return resolversRet;
      throw new Error(`anon-rpc page: unexpected specifier call ${selector}`);
    },
  };
}

/**
 * Specifier address for a bundle loaded from a file: derived from its hash, so
 * the same bytes keep the same SPEC §11 storage namespace (as in the
 * reference demo).
 */
export function localSpecifierAddress(workerHash: Hex): string {
  return `0x${workerHash.slice(2, 42)}`;
}
