import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256, stringToBytes } from "viem";
import { verifyBootstrap, verifyPinnedSnapshot, type PinnedSnapshot } from "@hisoka-io/nox-client";
import { DEFAULT_ENTRIES } from "@/anon-rpc/lib/config";
// The files' exact text (ASCII), as anon-rpc-worker ships them.
import snapshotText from "@/lib/kps/nox-snapshot.json?raw";
import snapshotPin from "@/lib/kps/nox-snapshot.json.keccak256?raw";
import bootstrapText from "@/lib/kps/nox-bootstrap.json?raw";

describe("vendored KPS snapshot", () => {
  const bytes = stringToBytes(snapshotText);
  const pin = snapshotPin;

  it("matches the keccak-256 shipped with anon-rpc-worker", () => {
    const [hash, name] = pin.trim().split(/\s+/);
    expect(name).toBe("nox-snapshot.json");
    expect(keccak256(bytes)).toBe(hash);
  });

  it("passes the client's snapshot and bootstrap checks", () => {
    const pinned = JSON.parse(snapshotText) as PinnedSnapshot;
    expect(() => verifyPinnedSnapshot(pinned)).not.toThrow();
    const bootstrap = verifyBootstrap(JSON.parse(bootstrapText), pinned);
    // The anon-rpc page names the same three anchors.
    expect([...bootstrap.anchors].sort()).toEqual(DEFAULT_ENTRIES.map((e) => e.address).sort());
  });
});

interface FakeClient {
  mode: string;
  disconnect: ReturnType<typeof vi.fn>;
}

const connect = vi.fn<(config: { mode?: string }) => Promise<FakeClient>>();

vi.mock("@hisoka-io/nox-client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@hisoka-io/nox-client")>();
  return { ...real, NoxClient: { connect: (config: { mode?: string }) => connect(config) } };
});

function fake(mode: string): FakeClient {
  return { mode, disconnect: vi.fn() };
}

async function freshNox() {
  vi.resetModules();
  return import("@/lib/nox");
}

describe("Explorer client transport", () => {
  const hadRtc = "RTCPeerConnection" in globalThis;
  const savedRtc = (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection;

  beforeEach(() => {
    connect.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = function RTCPeerConnection() {};
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (hadRtc) (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = savedRtc;
    else delete (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection;
  });

  it("connects in KPS mode with the pinned snapshot and no seed or chain RPC", async () => {
    connect.mockImplementation(async (config) => fake(config.mode ?? "classic"));
    const nox = await freshNox();
    const client = (await nox.getClient()) as unknown as FakeClient;
    expect(client.mode).toBe("kps");
    expect(connect).toHaveBeenCalledTimes(1);
    const config = connect.mock.calls[0]![0] as Record<string, unknown>;
    expect(config.seeds).toBeUndefined();
    expect(config.ethRpcUrl).toBeUndefined();
    expect(nox.getTransport()).toEqual({ kind: "kps", fallbackReason: null });
  });

  it("falls back to classic with a warning when the KPS boot throws TOPOLOGY_STALE", async () => {
    connect.mockImplementation(async (config) => {
      if (config.mode === "kps") throw Object.assign(new Error("pinned node set superseded"), { code: "TOPOLOGY_STALE" });
      return fake("classic");
    });
    const nox = await freshNox();
    const client = (await nox.getClient()) as unknown as FakeClient;
    expect(client.mode).toBe("classic");
    expect(nox.getTransport()?.kind).toBe("classic");
    expect(nox.getTransport()?.fallbackReason).toContain("TOPOLOGY_STALE");
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("uses classic without trying KPS when the browser has no WebRTC", async () => {
    delete (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection;
    connect.mockImplementation(async (config) => fake(config.mode ?? "classic"));
    const nox = await freshNox();
    await nox.getClient();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect.mock.calls[0]![0].mode).toBeUndefined();
    expect(nox.getTransport()?.fallbackReason).toContain("RTCPeerConnection");
  });

  it("falls back after the KPS boot deadline and disconnects a late KPS client", async () => {
    vi.useFakeTimers();
    let lateResolve: ((c: FakeClient) => void) | undefined;
    const late = fake("kps");
    connect.mockImplementation((config) =>
      config.mode === "kps" ? new Promise<FakeClient>((resolve) => (lateResolve = resolve)) : Promise.resolve(fake("classic")),
    );
    const nox = await freshNox();
    const pending = nox.getClient();
    await vi.advanceTimersByTimeAsync(nox.KPS_BOOT_DEADLINE_MS);
    const client = (await pending) as unknown as FakeClient;
    expect(client.mode).toBe("classic");
    expect(nox.getTransport()?.fallbackReason).toContain(`${nox.KPS_BOOT_DEADLINE_MS} ms`);
    lateResolve!(late);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.disconnect).toHaveBeenCalledTimes(1);
  });

  it("bounds the classic boot too, rejects past the deadline and disconnects a late classic client", async () => {
    vi.useFakeTimers();
    delete (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection;
    let lateResolve: ((c: FakeClient) => void) | undefined;
    const late = fake("classic");
    connect.mockImplementation(() => new Promise<FakeClient>((resolve) => (lateResolve = resolve)));
    const nox = await freshNox();
    const pending = nox.getClient();
    const outcome = expect(pending).rejects.toThrow(`${nox.CLASSIC_CONNECT_DEADLINE_MS} ms`);
    await vi.advanceTimersByTimeAsync(nox.CLASSIC_CONNECT_DEADLINE_MS);
    await outcome;
    expect(nox.isConnected()).toBe(false);
    lateResolve!(late);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.disconnect).toHaveBeenCalledTimes(1);
  });

  it("shares one connection between concurrent callers and clears the transport on disconnect", async () => {
    connect.mockImplementation(async (config) => fake(config.mode ?? "classic"));
    const nox = await freshNox();
    const [a, b] = await Promise.all([nox.getClient(), nox.getClient()]);
    expect(a).toBe(b);
    expect(connect).toHaveBeenCalledTimes(1);
    nox.disconnectClient();
    expect(nox.isConnected()).toBe(false);
    expect(nox.getTransport()).toBeNull();
  });
});
