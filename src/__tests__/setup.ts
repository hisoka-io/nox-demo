import { NoxClient, initNodeCrypto } from "@hisoka-io/nox-client";

const SEED_URL = "https://api.hisoka.io/seed/topology";

let client: NoxClient | null = null;
let connecting: Promise<NoxClient> | null = null;

export async function getTestClient(): Promise<NoxClient> {
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    await initNodeCrypto();
    const c = await NoxClient.connect({
      seeds: [SEED_URL],
      timeoutMs: 60_000,
      surbsPerRequest: 10,
      powDifficulty: 3,
      dangerouslySkipFingerprintCheck: true,
    });
    client = c;
    return c;
  })();

  return connecting;
}
