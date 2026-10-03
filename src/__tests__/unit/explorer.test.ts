import { describe, it, expect } from "vitest";
import {
  CHAINS, DEFAULT_CHAIN, RESPONSE_BUDGET, buildAbiUrl, parseAbiResponse, parseTokenBalances, supportsRpcMode,
} from "@/lib/blockscout";
import { knownAbi, NOX_REGISTRY_ABI } from "@/lib/abi";
import { NOX_REGISTRY } from "@/lib/network";
import { parseTopology } from "@/hooks/useTopology";

describe("chain modes", () => {
  it("only offers RPC mode on Arb Sepolia, the exit's default chain", () => {
    expect(supportsRpcMode(DEFAULT_CHAIN)).toBe(true);
    for (const chain of CHAINS.filter((c) => c.id !== "arbitrum-sepolia")) {
      expect(supportsRpcMode(chain)).toBe(false);
    }
  });
});

describe("response budgets", () => {
  it("keeps the token list budget near the real ~27 KB page size", () => {
    expect(RESPONSE_BUDGET.tokens).toBeGreaterThanOrEqual(40_000);
    expect(RESPONSE_BUDGET.tokens).toBeLessThanOrEqual(60_000);
  });
});

describe("token list parsing", () => {
  it("does not keep third-party icon URLs", () => {
    const [token] = parseTokenBalances({
      items: [{ value: "1", token: { symbol: "X", name: "X", address: "0x1", decimals: "6", icon_url: "https://assets.example/x.png" } }],
    });
    expect(token.decimals).toBe(6);
    expect(Object.values(token)).not.toContain("https://assets.example/x.png");
  });
});

describe("ABI lookup", () => {
  it("uses the ABI-only endpoint", () => {
    expect(buildAbiUrl(DEFAULT_CHAIN, "0xabc")).toBe(
      "https://arbitrum-sepolia.blockscout.com/api?module=contract&action=getabi&address=0xabc",
    );
  });

  it("parses verified and unverified replies", () => {
    const abi = [{ type: "function", name: "f", inputs: [], outputs: [], stateMutability: "view" }];
    expect(parseAbiResponse({ status: "1", message: "OK", result: JSON.stringify(abi) })).toEqual(abi);
    expect(parseAbiResponse({ status: "0", message: "Contract source code not verified", result: null })).toBeNull();
    expect(parseAbiResponse({ status: "1", result: "not json" })).toBeNull();
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
