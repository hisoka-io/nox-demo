import { describe, it, expect, beforeAll } from "vitest";
import { decodeFunctionResult, encodeFunctionData, type Hex } from "viem";
import { getTestClient, LIVE } from "./setup";
import { CHAINS, MULTICALL3, MULTICALL3_ABI, parseTokenBalances, rpcOptions, tokenBalancesCall } from "@/lib/chains";
import { GOV_SAFE } from "@/lib/network";
import { formatTokenBalance } from "@/lib/format";
import type { Chain } from "@/lib/chains";
import type { NoxClient } from "@hisoka-io/nox-client";

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
function addressForChain(chain: Chain): Hex {
  return chain.id === "arbitrum-sepolia" ? (GOV_SAFE as Hex) : VITALIK;
}

const META_ABI = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

describe.skipIf(!LIVE)("Balance lookup via the mixnet", () => {
  let client: NoxClient;

  beforeAll(async () => {
    client = await getTestClient();
  });

  for (const chain of CHAINS) {
    describe(`${chain.name} (${chain.id})`, () => {
      const addr = addressForChain(chain);

      it("is the chain it claims to be", async () => {
        const id = await client.rpcCall("eth_chainId", [], rpcOptions(chain));
        expect(Number(BigInt(id as string))).toBe(chain.chainId);
      });

      it("reads the native balance and the account nonce", async () => {
        const [balance, nonce] = await Promise.all([
          client.rpcCall("eth_getBalance", [addr, "latest"], rpcOptions(chain)),
          client.rpcCall("eth_getTransactionCount", [addr, "latest"], rpcOptions(chain)),
        ]);
        expect(BigInt(balance as string)).toBeGreaterThanOrEqual(0n);
        expect(parseFloat(formatTokenBalance(BigInt(balance as string), chain.decimals))).toBeGreaterThanOrEqual(0);
        expect(BigInt(nonce as string)).toBeGreaterThanOrEqual(0n);
      });

      it("reads every listed token balance in one Multicall3 call", async () => {
        const raw = await client.rpcCall("eth_call", tokenBalancesCall(chain.tokens, addr), rpcOptions(chain));
        const balances = parseTokenBalances(chain.tokens, raw as Hex);
        expect(balances).toHaveLength(chain.tokens.length);
        for (const b of balances) {
          expect(b.balance).not.toBeNull();
          expect(b.balance! >= 0n).toBe(true);
        }
      });

      it("lists each token with its on-chain symbol and decimals", async () => {
        const calls = chain.tokens.flatMap((t) => [
          { target: t.address, allowFailure: false, callData: encodeFunctionData({ abi: META_ABI, functionName: "symbol" }) },
          { target: t.address, allowFailure: false, callData: encodeFunctionData({ abi: META_ABI, functionName: "decimals" }) },
        ]);
        const data = encodeFunctionData({ abi: MULTICALL3_ABI, functionName: "aggregate3", args: [calls] });
        const raw = await client.rpcCall("eth_call", [{ to: MULTICALL3, data }, "latest"], rpcOptions(chain));
        const results = decodeFunctionResult({ abi: MULTICALL3_ABI, functionName: "aggregate3", data: raw as Hex });
        chain.tokens.forEach((t, i) => {
          const symbol = decodeFunctionResult({ abi: META_ABI, functionName: "symbol", data: results[2 * i].returnData });
          const decimals = decodeFunctionResult({ abi: META_ABI, functionName: "decimals", data: results[2 * i + 1].returnData });
          expect(decimals, `${t.symbol} decimals`).toBe(t.decimals);
          expect(symbol.toUpperCase(), `${t.address} symbol`).toBe(t.symbol.toUpperCase());
        });
      });
    });
  }
});
