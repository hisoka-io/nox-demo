import { describe, it, expect } from "vitest";
import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, type Hex } from "viem";
import {
  CHAINS, DEFAULT_CHAIN, MULTICALL3, MULTICALL3_ABI, RESPONSE_BUDGET,
  buildAbiUrl, parseAbiResponse, parseTokenBalances, rpcOptions, tokenBalancesCall,
} from "@/lib/chains";
import { knownAbi, NOX_REGISTRY_ABI } from "@/lib/abi";
import { NOX_REGISTRY } from "@/lib/network";
import { parseTopology } from "@/hooks/useTopology";

describe("chains", () => {
  it("reads Arb Sepolia through the exit's own provider and every other chain through its listed RPC", () => {
    expect(DEFAULT_CHAIN.id).toBe("arbitrum-sepolia");
    expect(rpcOptions(DEFAULT_CHAIN)).toBeUndefined();
    for (const chain of CHAINS.filter((c) => c !== DEFAULT_CHAIN)) {
      expect(rpcOptions(chain)).toEqual({ rpcUrl: chain.rpcUrl });
      expect(new URL(chain.rpcUrl!).protocol).toBe("https:");
    }
  });

  it("has unique chain ids and unique token addresses per chain", () => {
    expect(new Set(CHAINS.map((c) => c.chainId)).size).toBe(CHAINS.length);
    for (const chain of CHAINS) {
      const addrs = chain.tokens.map((t) => t.address.toLowerCase());
      expect(new Set(addrs).size).toBe(addrs.length);
      for (const a of addrs) expect(a).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });
});

describe("token balances via Multicall3", () => {
  const owner: Hex = "0x00000000000000000000000000000000000000aa";
  const tokens = CHAINS[1].tokens.slice(0, 3);

  it("batches one balanceOf(owner) per token into a single aggregate3 call", () => {
    const [call, tag] = tokenBalancesCall(tokens, owner);
    expect(tag).toBe("latest");
    expect(call.to).toBe(MULTICALL3);
    const { functionName, args } = decodeFunctionData({ abi: MULTICALL3_ABI, data: call.data });
    expect(functionName).toBe("aggregate3");
    const calls = args[0];
    expect(calls.map((c) => c.target)).toEqual(tokens.map((t) => t.address));
    for (const c of calls) {
      expect(c.allowFailure).toBe(true);
      expect(c.callData.startsWith("0x70a08231")).toBe(true);
      expect(c.callData.toLowerCase().endsWith(owner.slice(2))).toBe(true);
    }
  });

  it("decodes balances in token order and marks reverted calls", () => {
    const word = (n: bigint) => encodeAbiParameters([{ type: "uint256" }], [n]);
    const raw = encodeFunctionResult({
      abi: MULTICALL3_ABI,
      functionName: "aggregate3",
      result: [
        { success: true, returnData: word(5n) },
        { success: false, returnData: "0x" },
        { success: true, returnData: word(0n) },
      ],
    });
    const out = parseTokenBalances(tokens, raw);
    expect(out.map((t) => t.balance)).toEqual([5n, null, 0n]);
    expect(out.map((t) => t.symbol)).toEqual(tokens.map((t) => t.symbol));
  });

  it("rejects a reply with the wrong number of results", () => {
    const raw = encodeFunctionResult({ abi: MULTICALL3_ABI, functionName: "aggregate3", result: [] });
    expect(() => parseTokenBalances(tokens, raw)).toThrow(/0 results for 3 tokens/);
  });
});

describe("ABI lookup", () => {
  it("uses Sourcify's v2 contract endpoint for the chain, asking for the ABI only", () => {
    expect(buildAbiUrl(DEFAULT_CHAIN, "0xabc")).toBe(
      "https://sourcify.dev/server/v2/contract/421614/0xabc?fields=abi",
    );
    expect(RESPONSE_BUDGET.abi).toBeGreaterThanOrEqual(30_000);
  });

  it("parses replies with and without an ABI", () => {
    const abi = [{ type: "function", name: "f", inputs: [], outputs: [], stateMutability: "view" }];
    expect(parseAbiResponse({ abi, matchId: "1" })).toEqual(abi);
    expect(parseAbiResponse({ abi: [] })).toBeNull();
    expect(parseAbiResponse({ customCode: "not_found" })).toBeNull();
    expect(parseAbiResponse(null)).toBeNull();
  });

  it("matches built-in ABIs regardless of address case", () => {
    expect(knownAbi(NOX_REGISTRY)).toBe(NOX_REGISTRY_ABI);
    expect(knownAbi(NOX_REGISTRY.toLowerCase())).toBe(NOX_REGISTRY_ABI);
    expect(knownAbi("0x0000000000000000000000000000000000000001")).toBeUndefined();
  });
});

describe("topology liveness", () => {
  const node = (address: string, layer: number, role: number) => ({
    address, layer, role, url: "/ip4/1.2.3.4/tcp/1", ingress_url: "https://n", sphinx_key: "00",
  });

  it("marks nodes offline from the liveness list", () => {
    const topo = parseTopology({
      nodes: [node("0xAA", 0, 1), node("0xbb", 2, 2)],
      liveness: [
        { address: "0xaa", status: "online", observed_at_unix: 1 },
        { address: "0xbb", status: "offline", observed_at_unix: 1 },
      ],
    });
    expect(topo.nodes.map((n) => n.online)).toEqual([true, false]);
  });

  it("treats snapshots without liveness as online", () => {
    const topo = parseTopology({ nodes: [node("0xaa", 1, 1)] });
    expect(topo.nodes[0].online).toBe(true);
  });
});
