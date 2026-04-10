export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
  truncated: boolean;
}

export function decodeHttpResponse(data: Uint8Array): HttpResponse {
  let offset = 0;

  function readU16(): number {
    const v = data[offset] | (data[offset + 1] << 8);
    offset += 2;
    return v;
  }

  function readU64(): number {
    const lo = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
    offset += 8;
    return lo;
  }

  function readBytes(): Uint8Array {
    const len = readU64();
    const slice = data.slice(offset, offset + len);
    offset += len;
    return slice;
  }

  function readString(): string {
    return new TextDecoder().decode(readBytes());
  }

  function readBool(): boolean {
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
  const text = new TextDecoder().decode(resp.body);
  return JSON.parse(text) as T;
}
