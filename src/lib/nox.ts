import { NoxClient } from "@hisoka-io/nox-client";
import { NOX_REGISTRY_ADDRESS, NOX_RPC_URL, NOX_SEED_URL } from "@/lib/network";

let instance: NoxClient | null = null;
let connecting: Promise<NoxClient> | null = null;

export async function getClient(): Promise<NoxClient> {
  if (instance) return instance;
  if (connecting) return connecting;

  connecting = NoxClient.connect({
    seeds: [NOX_SEED_URL],
    ethRpcUrl: NOX_RPC_URL,
    registryAddress: NOX_REGISTRY_ADDRESS,
    timeoutMs: 30_000,
  });

  try {
    instance = await connecting;
    return instance;
  } finally {
    connecting = null;
  }
}

export function disconnectClient() {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}

export function isConnected(): boolean {
  return instance !== null;
}
