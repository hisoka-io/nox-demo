import { describe, it, expect, beforeAll } from "vitest";
import { getTestClient } from "./setup";
import { decodeHttpResponseJson } from "@/lib/http-response";
import {
  CHAINS, buildUrl,
  parseAddressInfo, parseTokenBalances, parseTransactions, parseTokenTransfers,
} from "@/lib/blockscout";
import { formatTokenBalance } from "@/lib/format";
import type { Chain } from "@/lib/blockscout";
import type { NoxClient } from "@hisoka-io/nox-client";

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const DEPLOYER = "0x8F4eB35a24bF75C2C86917d324Cac34EB2EFc534";

function addressForChain(chain: Chain): string {
  return chain.id === "arbitrum-sepolia" ? DEPLOYER : VITALIK;
}

describe("Balance Lookup via Mixnet", () => {
  let client: NoxClient;

  beforeAll(async () => {
    client = await getTestClient();
  });

  describe("RPC Mode (Arb Sepolia default)", () => {
    it("eth_getBalance returns a hex balance for deployer", async () => {
      const result = await client.rpcCall("eth_getBalance", [DEPLOYER, "latest"]);
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect((result as string).startsWith("0x")).toBe(true);
      expect(BigInt(result as string)).toBeGreaterThanOrEqual(0n);
    });

    it("eth_getBalance formats correctly", async () => {
      const result = await client.rpcCall("eth_getBalance", [VITALIK, "latest"]);
      const balance = BigInt(result as string);
      const formatted = formatTokenBalance(balance, 18);
      expect(parseFloat(formatted)).toBeGreaterThanOrEqual(0);
    });
  });

  for (const chain of CHAINS) {
    describe(`Explorer API - ${chain.name} (${chain.id})`, () => {
      const addr = addressForChain(chain);

      it("fetches address info", async () => {
        const url = buildUrl(chain, `/addresses/${addr}`);
        const raw = await client.httpRequest(
          "GET", url,
          [["Accept", "application/json"]],
          new Uint8Array(0),
          { expectedResponseBytes: 10_000 },
        );

        const data = decodeHttpResponseJson<Record<string, unknown>>(raw);
        const info = parseAddressInfo(data);

        expect(info.address.toLowerCase()).toBe(addr.toLowerCase());
        expect(info.coinBalance).toBeDefined();
        expect(BigInt(info.coinBalance)).toBeGreaterThanOrEqual(0n);
      });

      it("fetches token balances", async () => {
        const url = buildUrl(chain, `/addresses/${addr}/tokens?type=ERC-20`);
        const raw = await client.httpRequest(
          "GET", url,
          [["Accept", "application/json"]],
          new Uint8Array(0),
          { expectedResponseBytes: 200_000 },
        );

        const data = decodeHttpResponseJson<unknown>(raw);
        const tokens = parseTokenBalances(data as Record<string, unknown>);
        expect(Array.isArray(tokens)).toBe(true);

        for (const token of tokens) {
          expect(token.symbol).toBeDefined();
          expect(token.decimals).toBeGreaterThanOrEqual(0);
          expect(BigInt(token.balance)).toBeGreaterThanOrEqual(0n);
        }
      });

      it("fetches transactions", async () => {
        const url = buildUrl(chain, `/addresses/${addr}/transactions`);
        const raw = await client.httpRequest(
          "GET", url,
          [["Accept", "application/json"]],
          new Uint8Array(0),
          { expectedResponseBytes: 50_000, timeoutMs: 60_000 },
        );

        const data = decodeHttpResponseJson<Record<string, unknown>>(raw);
        const txs = parseTransactions(data);
        expect(Array.isArray(txs)).toBe(true);

        if (txs.length > 0) {
          const tx = txs[0];
          expect(tx.hash.startsWith("0x")).toBe(true);
          expect(tx.from.startsWith("0x")).toBe(true);
          expect(tx.status).toBeDefined();
        }
      });

      it("fetches token transfers", async () => {
        const url = buildUrl(chain, `/addresses/${addr}/token-transfers`);
        const raw = await client.httpRequest(
          "GET", url,
          [["Accept", "application/json"]],
          new Uint8Array(0),
          { expectedResponseBytes: 50_000, timeoutMs: 60_000 },
        );

        const data = decodeHttpResponseJson<Record<string, unknown>>(raw);
        const transfers = parseTokenTransfers(data);
        expect(Array.isArray(transfers)).toBe(true);

        for (const t of transfers) {
          expect(t.txHash.startsWith("0x")).toBe(true);
          expect(t.from.startsWith("0x")).toBe(true);
          expect(t.to.startsWith("0x")).toBe(true);
          expect(t.symbol).toBeDefined();
        }
      });
    });
  }
});
