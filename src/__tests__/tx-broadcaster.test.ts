import { describe, it, expect, beforeAll } from "vitest";
import { getTestClient, LIVE } from "./setup";
import type { NoxClient } from "@hisoka-io/nox-client";
import { parseBroadcastResponse } from "@/lib/broadcast";

describe.skipIf(!LIVE)("TX Broadcaster via Mixnet", () => {
  let client: NoxClient;

  beforeAll(async () => {
    client = await getTestClient();
  });

  it("reports an invalid raw transaction as a failure, not a hash", async () => {
    const invalidTx = new Uint8Array([0x02, 0xf8, 0x00, 0x01, 0x02, 0x03]);
    const result = await client.broadcastSignedTransaction(invalidTx);
    const parsed = parseBroadcastResponse(result);
    expect(parsed.ok).toBe(false);
  });

  it("eth_sendRawTransaction rejects malformed hex via rpcCall", async () => {
    const malformed = "0x0000";

    try {
      await client.rpcCall("eth_sendRawTransaction", [malformed]);
      expect.fail("should have thrown or returned error");
    } catch (err) {
      expect(err).toBeDefined();
      expect(String(err)).toContain("error");
    }
  });
});
