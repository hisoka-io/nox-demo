import { describe, it, expect, beforeAll } from "vitest";
import { getTestClient } from "./setup";
import { encodeFunctionData, decodeFunctionResult } from "viem";
import { NOX_REGISTRY_ABI, DARKPOOL_ABI, ERC20_ABI } from "@/lib/abi";
import type { Abi } from "viem";
import type { NoxClient } from "@hisoka-io/nox-client";

const NOX_REGISTRY = "0x8626aF80db409BeD3C19871FAdf9b0Ce7Aa641Bc";
const DARKPOOL = "0x7A3B2A44559A4b66cCA2E207cd8aDE5b23BE6b7B";
const NOX_STK = "0x208be235AAB9b8b5d86285b2684c8e6743e662b5";

describe("Contract Reader via Mixnet", () => {
  let client: NoxClient;

  beforeAll(async () => {
    client = await getTestClient();
  });

  describe("NoxRegistry", () => {
    it("reads relayerCount", async () => {
      const calldata = encodeFunctionData({
        abi: NOX_REGISTRY_ABI as unknown as Abi,
        functionName: "relayerCount",
      });

      const raw = await client.rpcCall("eth_call", [{ to: NOX_REGISTRY, data: calldata }, "latest"]);
      expect(raw).toBeDefined();
      expect(typeof raw).toBe("string");
      expect((raw as string).startsWith("0x")).toBe(true);

      const decoded = decodeFunctionResult({
        abi: NOX_REGISTRY_ABI as unknown as Abi,
        functionName: "relayerCount",
        data: raw as `0x${string}`,
      });

      expect(typeof decoded).toBe("bigint");
      expect(decoded as bigint).toBeGreaterThan(0n);
    });

    it("reads topologyFingerprint", async () => {
      const calldata = encodeFunctionData({
        abi: NOX_REGISTRY_ABI as unknown as Abi,
        functionName: "topologyFingerprint",
      });

      const raw = await client.rpcCall("eth_call", [{ to: NOX_REGISTRY, data: calldata }, "latest"]);
      expect(raw).toBeDefined();

      const decoded = decodeFunctionResult({
        abi: NOX_REGISTRY_ABI as unknown as Abi,
        functionName: "topologyFingerprint",
        data: raw as `0x${string}`,
      });

      expect(typeof decoded).toBe("string");
      expect((decoded as string).startsWith("0x")).toBe(true);
      expect((decoded as string).length).toBe(66);
    });
  });

  describe("DarkPool", () => {
    it("reads getCurrentRoot", async () => {
      const calldata = encodeFunctionData({
        abi: DARKPOOL_ABI as unknown as Abi,
        functionName: "getCurrentRoot",
      });

      const raw = await client.rpcCall("eth_call", [{ to: DARKPOOL, data: calldata }, "latest"]);
      expect(raw).toBeDefined();

      const decoded = decodeFunctionResult({
        abi: DARKPOOL_ABI as unknown as Abi,
        functionName: "getCurrentRoot",
        data: raw as `0x${string}`,
      });

      expect(typeof decoded).toBe("string");
      expect((decoded as string).length).toBe(66);
    });

    it("reads isKnownRoot for the current root", async () => {
      const rootCalldata = encodeFunctionData({
        abi: DARKPOOL_ABI as unknown as Abi,
        functionName: "getCurrentRoot",
      });

      const rootRaw = await client.rpcCall("eth_call", [{ to: DARKPOOL, data: rootCalldata }, "latest"]);
      const root = decodeFunctionResult({
        abi: DARKPOOL_ABI as unknown as Abi,
        functionName: "getCurrentRoot",
        data: rootRaw as `0x${string}`,
      });

      const checkCalldata = encodeFunctionData({
        abi: DARKPOOL_ABI as unknown as Abi,
        functionName: "isKnownRoot",
        args: [root as `0x${string}`],
      });

      const checkRaw = await client.rpcCall("eth_call", [{ to: DARKPOOL, data: checkCalldata }, "latest"]);
      const isKnown = decodeFunctionResult({
        abi: DARKPOOL_ABI as unknown as Abi,
        functionName: "isKnownRoot",
        data: checkRaw as `0x${string}`,
      });

      expect(isKnown).toBe(true);
    });
  });

  describe("ERC-20 (NOX-STK Token)", () => {
    it("reads token name", async () => {
      const calldata = encodeFunctionData({
        abi: ERC20_ABI as unknown as Abi,
        functionName: "name",
      });

      const raw = await client.rpcCall("eth_call", [{ to: NOX_STK, data: calldata }, "latest"]);
      expect(raw).toBeDefined();

      const decoded = decodeFunctionResult({
        abi: ERC20_ABI as unknown as Abi,
        functionName: "name",
        data: raw as `0x${string}`,
      });

      expect(typeof decoded).toBe("string");
      expect((decoded as string).length).toBeGreaterThan(0);
    });

    it("reads token symbol", async () => {
      const calldata = encodeFunctionData({
        abi: ERC20_ABI as unknown as Abi,
        functionName: "symbol",
      });

      const raw = await client.rpcCall("eth_call", [{ to: NOX_STK, data: calldata }, "latest"]);
      expect(raw).toBeDefined();

      const decoded = decodeFunctionResult({
        abi: ERC20_ABI as unknown as Abi,
        functionName: "symbol",
        data: raw as `0x${string}`,
      });

      expect(typeof decoded).toBe("string");
    });

    it("reads token decimals", async () => {
      const calldata = encodeFunctionData({
        abi: ERC20_ABI as unknown as Abi,
        functionName: "decimals",
      });

      const raw = await client.rpcCall("eth_call", [{ to: NOX_STK, data: calldata }, "latest"]);
      expect(raw).toBeDefined();

      const decoded = decodeFunctionResult({
        abi: ERC20_ABI as unknown as Abi,
        functionName: "decimals",
        data: raw as `0x${string}`,
      });

      expect(typeof decoded).toBe("number");
      expect(decoded as number).toBeGreaterThanOrEqual(0);
      expect(decoded as number).toBeLessThanOrEqual(18);
    });

    it("reads totalSupply", async () => {
      const calldata = encodeFunctionData({
        abi: ERC20_ABI as unknown as Abi,
        functionName: "totalSupply",
      });

      const raw = await client.rpcCall("eth_call", [{ to: NOX_STK, data: calldata }, "latest"]);
      expect(raw).toBeDefined();

      const decoded = decodeFunctionResult({
        abi: ERC20_ABI as unknown as Abi,
        functionName: "totalSupply",
        data: raw as `0x${string}`,
      });

      expect(typeof decoded).toBe("bigint");
      expect(decoded as bigint).toBeGreaterThanOrEqual(0n);
    });

    it("reads balanceOf for deployer", async () => {
      const deployerAddr = "0x8F4eB35a24bF75C2C86917d324Cac34EB2EFc534";
      const calldata = encodeFunctionData({
        abi: ERC20_ABI as unknown as Abi,
        functionName: "balanceOf",
        args: [deployerAddr],
      });

      const raw = await client.rpcCall("eth_call", [{ to: NOX_STK, data: calldata }, "latest"]);
      expect(raw).toBeDefined();

      const decoded = decodeFunctionResult({
        abi: ERC20_ABI as unknown as Abi,
        functionName: "balanceOf",
        data: raw as `0x${string}`,
      });

      expect(typeof decoded).toBe("bigint");
      expect(decoded as bigint).toBeGreaterThanOrEqual(0n);
    });
  });
});
