// The wallet calls the page runs: plain JSON-RPC over a fetch function, so
// the same request goes through `worker.fetch` (Nox) and `fetch` (direct).

import { decodeFunctionResult, encodeFunctionData, type Hex } from "viem";

export type CallId = "chainId" | "blockNumber" | "balance" | "erc20" | "batch";

export interface CallSpec {
  id: CallId;
  title: string;
  method: string;
}

export const CALLS: readonly CallSpec[] = [
  { id: "chainId", title: "Chain ID", method: "eth_chainId" },
  { id: "blockNumber", title: "Latest block", method: "eth_blockNumber" },
  { id: "balance", title: "ETH balance", method: "eth_getBalance" },
  { id: "erc20", title: "ERC-20 balanceOf", method: "eth_call" },
  { id: "batch", title: "JSON-RPC batch", method: "[5 calls]" },
];

export interface CallInputs {
  address: string;
  token: { address: string; symbol: string; decimals: number };
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
}

interface JsonRpcReply {
  id?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

function req(id: number, method: string, params: unknown[]): JsonRpcRequest {
  return { jsonrpc: "2.0", id, method, params };
}

export function buildRequest(id: CallId, inputs: CallInputs): JsonRpcRequest | JsonRpcRequest[] {
  const balanceOf = encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [inputs.address as Hex] });
  switch (id) {
    case "chainId":
      return req(1, "eth_chainId", []);
    case "blockNumber":
      return req(1, "eth_blockNumber", []);
    case "balance":
      return req(1, "eth_getBalance", [inputs.address, "latest"]);
    case "erc20":
      return req(1, "eth_call", [{ to: inputs.token.address, data: balanceOf }, "latest"]);
    case "batch":
      return [
        req(1, "eth_chainId", []),
        req(2, "eth_blockNumber", []),
        req(3, "eth_getBalance", [inputs.address, "latest"]),
        req(4, "eth_call", [{ to: inputs.token.address, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "symbol" }) }, "latest"]),
        req(5, "eth_call", [{ to: inputs.token.address, data: balanceOf }, "latest"]),
      ];
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CallResult {
  ok: true;
  ms: number;
  status: number;
  bytes: number;
  /** Result values in request order (one for a single call). */
  values: unknown[];
  summary: string;
}

export class RpcReplyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RpcReplyError";
    this.code = code;
  }
}

function unwrap(reply: JsonRpcReply): unknown {
  if (reply.error) throw new RpcReplyError("rpc-error", `RPC error ${reply.error.code ?? ""}: ${reply.error.message ?? "unknown"}`.trim());
  if (!("result" in reply)) throw new RpcReplyError("rpc-error", "JSON-RPC reply has no result");
  return reply.result;
}

/** Values in request order; batch replies may arrive in any order (JSON-RPC 2.0 §6). */
export function extractValues(request: JsonRpcRequest | JsonRpcRequest[], body: unknown): unknown[] {
  if (!Array.isArray(request)) {
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new RpcReplyError("rpc-error", "reply is not a JSON-RPC object");
    }
    return [unwrap(body as JsonRpcReply)];
  }
  if (!Array.isArray(body)) {
    const single = body as JsonRpcReply | null;
    throw new RpcReplyError(
      "rpc-error",
      single?.error?.message ? `batch refused: ${single.error.message}` : "batch reply is not an array",
    );
  }
  const byId = new Map<unknown, JsonRpcReply>();
  for (const item of body as JsonRpcReply[]) byId.set(item?.id, item);
  return request.map((r) => {
    const reply = byId.get(r.id);
    if (!reply) throw new RpcReplyError("rpc-error", `batch reply is missing id ${r.id}`);
    return unwrap(reply);
  });
}

function hexToBigInt(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) return null;
  return value === "0x" ? 0n : BigInt(value);
}

export function formatUnits(raw: bigint, decimals: number, maxFraction = 6): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

function decodeErc20Balance(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  try {
    return decodeFunctionResult({ abi: ERC20_ABI, functionName: "balanceOf", data: value as Hex });
  } catch {
    return null;
  }
}

function decodeSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return decodeFunctionResult({ abi: ERC20_ABI, functionName: "symbol", data: value as Hex });
  } catch {
    return null;
  }
}

export function summarize(id: CallId, values: unknown[], inputs: CallInputs): string {
  const [v] = values;
  switch (id) {
    case "chainId": {
      const n = hexToBigInt(v);
      return n === null ? String(v) : `${n.toString()} (${String(v)})`;
    }
    case "blockNumber": {
      const n = hexToBigInt(v);
      return n === null ? String(v) : `#${n.toLocaleString("en-US")}`;
    }
    case "balance": {
      const n = hexToBigInt(v);
      return n === null ? String(v) : `${formatUnits(n, 18)} ETH`;
    }
    case "erc20": {
      const n = decodeErc20Balance(v);
      return n === null ? String(v) : `${formatUnits(n, inputs.token.decimals)} ${inputs.token.symbol}`;
    }
    case "batch": {
      const [chain, block, balance, symbol, tokenBalance] = values;
      const parts = [
        `chain ${hexToBigInt(chain)?.toString() ?? "?"}`,
        `block #${hexToBigInt(block)?.toLocaleString("en-US") ?? "?"}`,
        `${formatUnits(hexToBigInt(balance) ?? 0n, 18)} ETH`,
        `${formatUnits(decodeErc20Balance(tokenBalance) ?? 0n, inputs.token.decimals)} ${decodeSymbol(symbol) ?? inputs.token.symbol}`,
      ];
      return parts.join(" · ");
    }
  }
}

/** Run one call over `fetchImpl`; throws the transport's own error (with its `code`). */
export async function runCall(
  fetchImpl: FetchLike,
  rpcUrl: string,
  id: CallId,
  inputs: CallInputs,
  options: { signal?: AbortSignal; now?: () => number } = {},
): Promise<CallResult> {
  const now = options.now ?? (() => performance.now());
  const request = buildRequest(id, inputs);
  const started = now();
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: options.signal,
  });
  const text = await response.text();
  const ms = Math.round(now() - started);
  if (!response.ok) throw new RpcReplyError("http-error", `HTTP ${response.status} from the RPC`);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new RpcReplyError("rpc-error", "the RPC reply is not JSON");
  }
  const values = extractValues(request, body);
  return { ok: true, ms, status: response.status, bytes: text.length, values, summary: summarize(id, values, inputs) };
}

export type Comparison = "same" | "close" | "different";

function blocksApart(a: unknown, b: unknown): bigint | null {
  const x = hexToBigInt(a);
  const y = hexToBigInt(b);
  if (x === null || y === null) return null;
  return x > y ? x - y : y - x;
}

/**
 * Blocks two answers may be apart and still count as the same chain view.
 * Arbitrum makes about 4 blocks a second and a mixnet call can take tens of
 * seconds longer than the direct one.
 */
export const CLOSE_BLOCKS = 1000n;

/**
 * Compare the two paths. The direct call and the mixnet call land a few
 * seconds apart, so the latest block (and state read at it) may move between
 * them: within CLOSE_BLOCKS that is "close", not "different".
 */
export function compareValues(id: CallId, a: unknown[], b: unknown[]): Comparison {
  if (JSON.stringify(a) === JSON.stringify(b)) return "same";
  if (id === "blockNumber") {
    const apart = blocksApart(a[0], b[0]);
    return apart !== null && apart <= CLOSE_BLOCKS ? "close" : "different";
  }
  if (id === "batch") {
    if (JSON.stringify(a[0]) !== JSON.stringify(b[0])) return "different";
    const apart = blocksApart(a[1], b[1]);
    return apart !== null && apart <= CLOSE_BLOCKS ? "close" : "different";
  }
  return "different";
}
