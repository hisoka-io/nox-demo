export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
  truncated: boolean;
}

export function decodeHttpResponse(data: Uint8Array): HttpResponse {
  let offset = 0;

  function need(n: number) {
    if (offset + n > data.length) {
      throw new Error("Malformed HTTP response from exit node");
    }
  }

  function readU16(): number {
    need(2);
    const v = data[offset] | (data[offset + 1] << 8);
    offset += 2;
    return v;
  }

  function readU64(): number {
    need(8);
    const view = new DataView(data.buffer, data.byteOffset + offset, 8);
    const lo = view.getUint32(0, true);
    const hi = view.getUint32(4, true);
    offset += 8;
    const v = hi * 2 ** 32 + lo;
    if (!Number.isSafeInteger(v)) throw new Error("Malformed HTTP response from exit node");
    return v;
  }

  function readBytes(): Uint8Array {
    const len = readU64();
    need(len);
    const slice = data.slice(offset, offset + len);
    offset += len;
    return slice;
  }

  function readString(): string {
    return new TextDecoder().decode(readBytes());
  }

  function readBool(): boolean {
    need(1);
    const v = data[offset];
    offset += 1;
    return v !== 0;
  }

  const status = readU16();

  const headerCount = readU64();
  const headers: Record<string, string> = {};
  for (let i = 0; i < headerCount; i++) {
    const key = readString();
    const val = readString();
    headers[key] = val;
  }

  const body = readBytes();
  const truncated = readBool();

  return { status, headers, body, truncated };
}

export function decodeHttpResponseJson<T>(data: Uint8Array): T {
  const resp = decodeHttpResponse(data);
  if (resp.status < 200 || resp.status >= 300) {
    const bodyText = new TextDecoder().decode(resp.body);
    throw new Error(`HTTP ${resp.status}: ${bodyText.slice(0, 200)}`);
  }
  if (resp.truncated) {
    throw new Error(
      `Response was truncated by the exit node (${resp.body.length} bytes received); it is too large to fetch privately`,
    );
  }
  const text = new TextDecoder().decode(resp.body);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON in response (${resp.body.length} bytes)`);
  }
}
