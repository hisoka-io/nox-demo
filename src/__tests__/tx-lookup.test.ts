import { describe, it, expect, beforeAll } from "vitest";
import { getTestClient } from "./setup";
import { decodeHttpResponseJson } from "@/lib/http-response";
import { CHAINS, buildUrl, parseTransactions } from "@/lib/blockscout";
import { formatEther, hexToDecimal } from "@/lib/format";
import type { NoxClient } from "@hisoka-io/nox-client";

const ARB_SEPOLIA_TX = "0x820a1a3b863e215a571558077afba729033ceb47badfa6f7ed30f65781f9f33a";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const DEPLOYER = "0x8F4eB35a24bF75C2C86917d324Cac34EB2EFc534";

describe("Transaction Lookup via Mixnet", () => {
  let client: NoxClient;

  beforeAll(async () => {
    client = await getTestClient();
  });

  describe("RPC Mode (Arb Sepolia)", () => {
    it("eth_getTransactionByHash returns transaction details", async () => {
      const tx = (await client.rpcCall("eth_getTransactionByHash", [ARB_SEPOLIA_TX])) as Record<string, string> | null;

      expect(tx).not.toBeNull();
      expect(tx!.hash.toLowerCase()).toBe(ARB_SEPOLIA_TX.toLowerCase());
      expect(tx!.from).toBeDefined();
      expect(tx!.from.startsWith("0x")).toBe(true);
      expect(tx!.value).toBeDefined();
      expect(tx!.nonce).toBeDefined();
      expect(tx!.blockNumber).toBeDefined();
    });

    it("eth_getTransactionReceipt returns receipt with status", async () => {
      const receipt = (await client.rpcCall("eth_getTransactionReceipt", [ARB_SEPOLIA_TX])) as Record<string, string> | null;

      expect(receipt).not.toBeNull();
      expect(receipt!.transactionHash.toLowerCase()).toBe(ARB_SEPOLIA_TX.toLowerCase());
      expect(["0x0", "0x1"]).toContain(receipt!.status);
      expect(receipt!.gasUsed).toBeDefined();
    });

    it("parallel tx + receipt fetch works", async () => {
      const [tx, receipt] = await Promise.all([
        client.rpcCall("eth_getTransactionByHash", [ARB_SEPOLIA_TX]) as Promise<Record<string, string> | null>,
        client.rpcCall("eth_getTransactionReceipt", [ARB_SEPOLIA_TX]) as Promise<Record<string, string> | null>,
      ]);

      expect(tx).not.toBeNull();
      expect(receipt).not.toBeNull();
      expect(tx!.blockNumber).toBe(receipt!.blockNumber);

      const formatted = formatEther(BigInt(tx!.value));
      expect(parseFloat(formatted)).toBeGreaterThanOrEqual(0);

      const gasUsed = hexToDecimal(receipt!.gasUsed);
      expect(parseInt(gasUsed)).toBeGreaterThan(0);
    });

    it("returns null for a non-existent hash", async () => {
      const fakeHash = "0x0000000000000000000000000000000000000000000000000000000000000001";
      const tx = await client.rpcCall("eth_getTransactionByHash", [fakeHash]);
      expect(tx).toBeNull();
    });
  });

  for (const chain of CHAINS) {
    const addr = chain.id === "arbitrum-sepolia" ? DEPLOYER : VITALIK;

    describe(`Explorer API - ${chain.name} (${chain.id})`, () => {
      it("fetches address transactions then looks up a single tx", async () => {
        const listUrl = buildUrl(chain, `/addresses/${addr}/transactions`);
        const listRaw = await client.httpRequest(
          "GET", listUrl,
          [["Accept", "application/json"]],
          new Uint8Array(0),
          { expectedResponseBytes: 200_000 },
        );

        const listData = decodeHttpResponseJson<Record<string, unknown>>(listRaw);
        const txs = parseTransactions(listData);
        expect(txs.length).toBeGreaterThan(0);

        const txHash = txs[0].hash;
        expect(txHash.startsWith("0x")).toBe(true);

        const txUrl = buildUrl(chain, `/transactions/${txHash}`);
        const txRaw = await client.httpRequest(
          "GET", txUrl,
          [["Accept", "application/json"]],
          new Uint8Array(0),
          { expectedResponseBytes: 50_000 },
        );

        const txData = decodeHttpResponseJson<Record<string, unknown>>(txRaw);
        expect(String(txData.hash).toLowerCase()).toBe(txHash.toLowerCase());
        expect(txData.status).toBeDefined();

        const from = txData.from as Record<string, unknown> | undefined;
        if (from) {
          expect(String(from.hash).startsWith("0x")).toBe(true);
        }
      });
    });
  }
});
