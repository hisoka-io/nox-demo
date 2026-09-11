import { describe, it, expect, beforeAll } from "vitest";
import { getTestClient } from "./setup";
import type { NoxClient } from "@hisoka-io/nox-client";

describe.skip("Mixnet Connection", () => {
  let client: NoxClient;

  beforeAll(async () => {
    client = await getTestClient();
  });

  it("connects to the NOX mixnet successfully", () => {
    expect(client).toBeDefined();
  });

  it("can fetch the current block number", async () => {
    const blockNum = await client.blockNumber();
    expect(typeof blockNum).toBe("number");
    expect(blockNum).toBeGreaterThan(0);
  });

  it("echo request round-trips through the mixnet", async () => {
    const payload = new TextEncoder().encode("nox-test-ping");
    const response = await client.sendEcho(payload);
    expect(response).toBeDefined();
    expect(response.length).toBeGreaterThan(0);

    const text = new TextDecoder().decode(response);
    expect(text).toBe("nox-test-ping");
  });
});
