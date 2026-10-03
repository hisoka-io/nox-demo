import { describe, it, expect } from "vitest";
import { parseBroadcastResponse, parseSignedTxHex } from "@/lib/broadcast";

const enc = (s: string) => new TextEncoder().encode(s);
const HASH = "0x" + "ab".repeat(32);

describe("parseBroadcastResponse", () => {
  it("accepts a raw 32-byte hash from the default route", () => {
    const bytes = new Uint8Array(32).fill(0xab);
    expect(parseBroadcastResponse(bytes)).toEqual({ ok: true, hash: HASH });
  });

  it("reports tx_error replies as failures, never as a hash", () => {
    const res = parseBroadcastResponse(enc("tx_error:Broadcast rejected: nonce too low"));
    expect(res).toEqual({ ok: false, error: "Broadcast rejected: nonce too low" });
  });

  it("treats a 32-byte tx_error reply as an error", () => {
    const msg = "tx_error:" + "x".repeat(23);
    expect(enc(msg).length).toBe(32);
    expect(parseBroadcastResponse(enc(msg)).ok).toBe(false);
  });

  it("parses the JSON string returned by the custom RPC route", () => {
    expect(parseBroadcastResponse(enc(JSON.stringify(HASH)))).toEqual({ ok: true, hash: HASH });
  });

  it("parses a JSON-RPC envelope and its error", () => {
    expect(parseBroadcastResponse(enc(JSON.stringify({ result: HASH })))).toEqual({ ok: true, hash: HASH });
    expect(
      parseBroadcastResponse(enc(JSON.stringify({ error: { code: -32000, message: "insufficient funds" } }))),
    ).toEqual({ ok: false, error: "insufficient funds" });
  });

  it("accepts a bare hex hash", () => {
    expect(parseBroadcastResponse(enc(HASH))).toEqual({ ok: true, hash: HASH });
    expect(parseBroadcastResponse(enc(HASH.slice(2)))).toEqual({ ok: true, hash: HASH });
  });

  it("rejects empty and unrecognised replies", () => {
    expect(parseBroadcastResponse(new Uint8Array(0)).ok).toBe(false);
    expect(parseBroadcastResponse(enc("\"not a hash\"")).ok).toBe(false);
    expect(parseBroadcastResponse(new Uint8Array(31)).ok).toBe(false);
    expect(parseBroadcastResponse(new Uint8Array(33)).ok).toBe(false);
  });
});

describe("parseSignedTxHex", () => {
  it("decodes valid hex", () => {
    expect(Array.from(parseSignedTxHex(" 0x02f8 ")!)).toEqual([0x02, 0xf8]);
  });

  it("rejects malformed input instead of silently zero-filling", () => {
    expect(parseSignedTxHex("02f8")).toBeNull();
    expect(parseSignedTxHex("0x2f8")).toBeNull();
    expect(parseSignedTxHex("0xzz")).toBeNull();
    expect(parseSignedTxHex("0x")).toBeNull();
  });
});
