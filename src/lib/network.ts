// Nox testnet on Arbitrum Sepolia (chainId 421614).
// Source of truth: nox-deployments/arbitrum-sepolia/<date>/deployment.json.
// Build-time VITE_NOX_* variables override these defaults.
export const NOX_REGISTRY = "0xF7BFf88A1412054a001Dc4b8aCBddAd6F9b26cB6";
export const DARKPOOL = "0x6DABb5682A62b3827eE7e0E02F1DACE896AD457a";
export const SOKA_TOKEN = "0x0F69cf1c9F4FF72471701036dd789c934458e630";
export const DEPLOYER = "0x8F4eB35a24bF75C2C86917d324Cac34EB2EFc534";

export const NOX_SEED_URL = import.meta.env.VITE_NOX_SEED_URL || "https://api.hisoka.io/seed";
export const NOX_RPC_URL = import.meta.env.VITE_NOX_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
export const NOX_REGISTRY_ADDRESS = import.meta.env.VITE_NOX_REGISTRY_ADDRESS || NOX_REGISTRY;
