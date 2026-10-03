import { NoxClient } from "@hisoka-io/nox-client";
import { NOX_REGISTRY_ADDRESS, NOX_RPC_URL, NOX_SEED_URL } from "@/lib/network";

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

/**
 * The mixnet suites talk to the live testnet, so they only run when
 * NOX_LIVE_TESTS=1 (the scheduled/manual live job in CI, or locally).
 */
export const LIVE = env.NOX_LIVE_TESTS === "1";

let client: NoxClient | null = null;
let connecting: Promise<NoxClient> | null = null;

// Same verified configuration the app uses (src/lib/nox.ts).
export async function getTestClient(): Promise<NoxClient> {
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const c = await NoxClient.connect({
      seeds: [NOX_SEED_URL],
      ethRpcUrl: NOX_RPC_URL,
      registryAddress: NOX_REGISTRY_ADDRESS,
      timeoutMs: 60_000,
    });
    client = c;
    return c;
  })();

  return connecting;
}
