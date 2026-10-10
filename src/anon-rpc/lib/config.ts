// Settings of the anon-rpc page: which worker to boot and which chain to query.
//
// Build-time VITE_ANON_RPC_* variables override the defaults, and the query
// string overrides both (?specifier=0x…&chain=11155111&rpc=https://…), so a
// link can point at any published specifier.

/**
 * The @anon-rpc/browser-harness version this page loads: the one the reference
 * anon-rpc demo pins. package.json pins the same version exactly (a unit test
 * keeps the two equal).
 */
export const HARNESS_VERSION = "0.3.2";

/** A chain that can hold an anon-rpc worker specifier. */
export interface SpecifierChain {
  id: number;
  name: string;
  /** Public RPC used for the two specifier reads (SPEC §4). */
  rpcUrl: string;
  /** Block explorer base URL (Etherscan layout: /address/<a>, /tx/<h>). */
  explorer: string;
}

export const SPECIFIER_CHAINS: readonly SpecifierChain[] = [
  {
    id: 11155111,
    name: "Ethereum Sepolia",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
  },
  {
    id: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://sepolia.arbiscan.io",
  },
  {
    id: 1,
    name: "Ethereum",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    explorer: "https://etherscan.io",
  },
];

/** A chain the wallet calls go to, with sample inputs for the calls. */
export interface TargetPreset {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorer: string;
  /** Address whose balance is read by default. */
  sampleAddress: string;
  sampleAddressLabel: string;
  token: { address: string; symbol: string; decimals: number };
}

export const TARGET_PRESETS: readonly TargetPreset[] = [
  {
    id: "arbitrum-sepolia",
    name: "Arbitrum Sepolia",
    chainId: 421614,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://sepolia.arbiscan.io",
    sampleAddress: "0x6774cA4baf6FFF84F02898a3DeE4299ed1f5aB4E",
    sampleAddressLabel: "Nox exit node nox-6",
    token: { address: "0x0F69cf1c9F4FF72471701036dd789c934458e630", symbol: "SOKA", decimals: 18 },
  },
  {
    id: "ethereum",
    name: "Ethereum",
    chainId: 1,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    explorer: "https://etherscan.io",
    sampleAddress: "0x00000000219ab540356cBB839Cbe05303d7705Fa",
    sampleAddressLabel: "Beacon deposit contract",
    token: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
  },
  {
    id: "ethereum-sepolia",
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    sampleAddress: "0x7f02C3E3c98b133055B8B348B2Ac625669Ed295D",
    sampleAddressLabel: "Sepolia deposit contract",
    token: { address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", symbol: "USDC", decimals: 6 },
  },
];

/**
 * The Nox entry nodes pinned in the worker bundle as default anchors
 * (`snapshot/nox-bootstrap.json` in @hisoka-io/anon-rpc-worker). The page uses
 * them only to name the entry the worker reports; the worker itself decides
 * where to dial.
 */
export interface KnownEntry {
  name: string;
  address: string;
}

export const DEFAULT_ENTRIES: readonly KnownEntry[] = [
  { name: "nox-1", address: "100.56.0.72:15005:uEiBVDwIs40bsslDkM-BYb2AOHw3PHe70_bj5U_09r7vdIQ" },
  { name: "nox-2", address: "3.232.137.146:15005:uEiDGVPDwsQ96ri9T5WLR6jZov_9LW-gRAgs-DN9FyKuHuw" },
  { name: "nox-8", address: "18.215.18.61:15005:uEiCStd3rfGTo0ts0lSUw5f22u93O3PLCZVWWQIv_MXHm7w" },
];

/** NoxRegistry on Arbitrum Sepolia: where the worker learns who the nodes are. */
export const NOX_REGISTRY = {
  address: "0xF7BFf88A1412054a001Dc4b8aCBddAd6F9b26cB6",
  chainId: 421614,
  explorer: "https://sepolia.arbiscan.io",
} as const;

export interface PageDefaults {
  specifier: string;
  chainId: number;
  specifierRpc: string;
  targetPresetId: string;
}

type Env = Readonly<Record<string, string | undefined>>;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function chainById(id: number): SpecifierChain | undefined {
  return SPECIFIER_CHAINS.find((c) => c.id === id);
}

export function targetPresetById(id: string): TargetPreset | undefined {
  return TARGET_PRESETS.find((p) => p.id === id);
}

function parseChainId(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** Default chain for the specifier read when nothing else names one. */
export const FALLBACK_SPECIFIER_CHAIN_ID = 11155111;

/**
 * The published Nox worker: @hisoka-io/anon-rpc-worker 0.4.0 (end-to-end
 * TLS), pinned by an ImmutableWorkerSpecifier on Ethereum Sepolia (workerHash
 * 0xd8bef626ec8511d7a468bca5137880680ca2da20d2ea4d9c981a2a3d0c86ba1e).
 */
export const RELEASED_SPECIFIER = {
  address: "0xDf5Db854BA75B52a4bF1a250a93D8d25cB982b2d",
  chainId: 11155111,
} as const;

/**
 * Resolve the page defaults: query string, then build-time env, then the
 * built-in fallbacks. Invalid values are ignored at each level rather than
 * carried into the form.
 */
export function resolveDefaults(env: Env, search: string): PageDefaults {
  const query = new URLSearchParams(search);

  const specifierCandidates = [query.get("specifier"), env.VITE_ANON_RPC_SPECIFIER];
  const namedSpecifier = specifierCandidates.map((v) => v?.trim() ?? "").find(isAddress);

  const chainId =
    [parseChainId(query.get("chain")), parseChainId(env.VITE_ANON_RPC_CHAIN_ID)].find((v) => v !== undefined) ??
    FALLBACK_SPECIFIER_CHAIN_ID;

  // The released specifier lives on one chain: it is the default only there.
  const specifier =
    namedSpecifier ?? (chainId === RELEASED_SPECIFIER.chainId ? RELEASED_SPECIFIER.address : "");

  const rpcCandidates = [query.get("rpc"), env.VITE_ANON_RPC_SPECIFIER_RPC];
  const specifierRpc =
    rpcCandidates.map((v) => v?.trim() ?? "").find(isHttpUrl) ?? chainById(chainId)?.rpcUrl ?? "";

  const targetCandidates = [query.get("target"), env.VITE_ANON_RPC_TARGET];
  const targetPresetId =
    targetCandidates.map((v) => v?.trim() ?? "").find((id) => targetPresetById(id) !== undefined) ??
    TARGET_PRESETS[0].id;

  return { specifier, chainId, specifierRpc, targetPresetId };
}

export function explorerAddressUrl(explorer: string, address: string): string {
  return `${explorer.replace(/\/+$/, "")}/address/${address}`;
}

/** Worker config (SPEC §7.1) from the text box: blank means no config at all. */
export function parseConfigText(text: string): unknown {
  if (!text.trim()) return undefined;
  return JSON.parse(text) as unknown;
}
