import { describe, it, expect, beforeAll } from "vitest";
import { getTestClient, LIVE } from "./setup";
import { CHAINS, rpcOptions } from "@/lib/chains";
import { formatEther, hexToDecimal } from "@/lib/format";
import { GOV_SAFE_CREATION_TX } from "@/lib/network";
import type { NoxClient } from "@hisoka-io/nox-client";

const ARB_SEPOLIA_TX = GOV_SAFE_CREATION_TX;

describe.skipIf(!LIVE)("Transaction lookup via the mixnet", () => {
  let client: NoxClient;

  beforeAll(async () => {
    client = await getTestClient();
  });

  describe("Arb Sepolia (exit default provider)", () => {
    it("eth_getTransactionByHash returns transaction details", async () => {
      const tx = (await client.rpcCall("eth_getTransactionByHash", [ARB_SEPOLIA_TX])) as Record<string, string> | null;

      expect(tx).not.toBeNull();
      expect(tx!.hash.toLowerCase()).toBe(ARB_SEPOLIA_TX.toLowerCase());
      expect(tx!.from.startsWith("0x")).toBe(true);
      expect(tx!.value).toBeDefined();
      expect(tx!.nonce).toBeDefined();
      expect(tx!.blockNumber).toBeDefined();
    });

    it("parallel tx + receipt fetch agree", async () => {
      const [tx, receipt] = await Promise.all([
        client.rpcCall("eth_getTransactionByHash", [ARB_SEPOLIA_TX]) as Promise<Record<string, string> | null>,
        client.rpcCall("eth_getTransactionReceipt", [ARB_SEPOLIA_TX]) as Promise<Record<string, string> | null>,
      ]);

      expect(tx).not.toBeNull();
      expect(receipt).not.toBeNull();
      expect(receipt!.transactionHash.toLowerCase()).toBe(ARB_SEPOLIA_TX.toLowerCase());
      expect(["0x0", "0x1"]).toContain(receipt!.status);
      expect(tx!.blockNumber).toBe(receipt!.blockNumber);
      expect(parseFloat(formatEther(BigInt(tx!.value)))).toBeGreaterThanOrEqual(0);
      expect(parseInt(hexToDecimal(receipt!.gasUsed))).toBeGreaterThan(0);
    });

    it("returns null for a non-existent hash", async () => {
      const fakeHash = "0x0000000000000000000000000000000000000000000000000000000000000001";
      const tx = await client.rpcCall("eth_getTransactionByHash", [fakeHash]);
      expect(tx).toBeNull();
    });
  });

  for (const chain of CHAINS.filter((c) => c.rpcUrl)) {
    describe(`${chain.name} (${chain.id}, ${new URL(chain.rpcUrl!).host})`, () => {
      for (const [label, pick] of [
        ["a recent block", (latest: bigint) => latest],
        ["a block halfway back in the chain's history", (latest: bigint) => latest / 2n],
      ] as const) {
        it(`looks up a transaction from ${label}, with its receipt`, async () => {
          const latest = BigInt((await client.rpcCall("eth_blockNumber", [], rpcOptions(chain))) as string);
          const number = `0x${pick(latest - 2n).toString(16)}`;
          const block = (await client.rpcCall("eth_getBlockByNumber", [number, false], rpcOptions(chain))) as
            { number: string; transactions: string[] } | null;
          expect(block).not.toBeNull();
          expect(block!.transactions.length).toBeGreaterThan(0);
          const hash = block!.transactions[0];

          const [tx, receipt] = await Promise.all([
            client.rpcCall("eth_getTransactionByHash", [hash], rpcOptions(chain)) as Promise<Record<string, string> | null>,
            client.rpcCall("eth_getTransactionReceipt", [hash], rpcOptions(chain)) as Promise<Record<string, string> | null>,
          ]);
          expect(tx!.hash.toLowerCase()).toBe(hash.toLowerCase());
          expect(tx!.blockNumber).toBe(block!.number);
          expect(["0x0", "0x1"]).toContain(receipt!.status);
        });
      }
    });
  }
});
