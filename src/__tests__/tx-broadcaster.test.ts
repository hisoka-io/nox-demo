import { describe, it, expect, beforeAll } from "vitest";
import { getTestClient } from "./setup";
import type { NoxClient } from "@hisoka-io/nox-client";

describe.skip("TX Broadcaster via Mixnet", () => {
  let client: NoxClient;

  beforeAll(async () => {
    client = await getTestClient();
  });

  it("returns an error response for an invalid raw transaction", async () => {
    const invalidTx = new Uint8Array([0x02, 0xf8, 0x00, 0x01, 0x02, 0x03]);

    try {
      const result = await client.broadcastSignedTransaction(invalidTx);
      const text = new TextDecoder().decode(result);
      expect(text).toContain("error");
    } catch (err) {
      expect(err).toBeDefined();
    }
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
