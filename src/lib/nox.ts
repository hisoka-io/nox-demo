import { NoxClient } from "@hisoka-io/nox-client";

let instance: NoxClient | null = null;
let connecting: Promise<NoxClient> | null = null;

export async function getClient(): Promise<NoxClient> {
  if (instance) return instance;
  if (connecting) return connecting;

  const seed = import.meta.env.VITE_NOX_SEED_URL;
  const ethRpcUrl = import.meta.env.VITE_NOX_RPC_URL;
  const registryAddress = import.meta.env.VITE_NOX_REGISTRY_ADDRESS;
  if (!seed || !ethRpcUrl || !registryAddress) {
    throw new Error(
      "NOX requires VITE_NOX_SEED_URL, VITE_NOX_RPC_URL, and VITE_NOX_REGISTRY_ADDRESS",
    );
  }
  connecting = NoxClient.connect({
    seeds: [seed],
    ethRpcUrl,
    registryAddress,
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
