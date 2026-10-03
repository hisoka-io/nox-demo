import { describe, it, expect } from "vitest";
import { decodeHttpResponse, decodeHttpResponseJson } from "@/lib/http-response";

// Mirrors bincode's encoding of the exit node's SerializableHttpResponse.
function encode(status: number, headers: [string, string][], body: Uint8Array, truncated: boolean): Uint8Array {
  const parts: number[] = [];
  const u64 = (n: number) => {
    for (let i = 0; i < 8; i++) parts.push(i < 4 ? (n >>> (8 * i)) & 0xff : 0);
  };
  const bytes = (b: Uint8Array) => { u64(b.length); parts.push(...b); };
  parts.push(status & 0xff, status >> 8);
  u64(headers.length);
  for (const [k, v] of headers) {
    bytes(new TextEncoder().encode(k));
    bytes(new TextEncoder().encode(v));
  }
  bytes(body);
  parts.push(truncated ? 1 : 0);
  return new Uint8Array(parts);
}

const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

describe("decodeHttpResponse", () => {
  it("round-trips status, headers and body", () => {
    const raw = encode(200, [["content-type", "application/json"]], json({ a: 1 }), false);
    const res = decodeHttpResponse(raw);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.truncated).toBe(false);
    expect(decodeHttpResponseJson(raw)).toEqual({ a: 1 });
  });

  it("surfaces truncated replies instead of a JSON parse error", () => {
    const raw = encode(200, [], new TextEncoder().encode("{\"items\":[{"), true);
    expect(() => decodeHttpResponseJson(raw)).toThrow(/truncated/);
  });

  it("surfaces HTTP errors with the body", () => {
    const raw = encode(404, [], new TextEncoder().encode("Not found"), false);
    expect(() => decodeHttpResponseJson(raw)).toThrow(/HTTP 404: Not found/);
  });

  it("rejects short or malformed input", () => {
    expect(() => decodeHttpResponse(new Uint8Array([200]))).toThrow(/Malformed/);
    const raw = encode(200, [], json({ a: 1 }), false);
    expect(() => decodeHttpResponse(raw.slice(0, raw.length - 3))).toThrow(/Malformed/);
  });
});
