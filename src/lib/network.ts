// Nox testnet on Arbitrum Sepolia (chainId 421614).
// Source of truth: nox-deployments/arbitrum-sepolia/<date>/deployment.json.
// Build-time VITE_NOX_* variables override these defaults.
export const NOX_REGISTRY = "0xF7BFf88A1412054a001Dc4b8aCBddAd6F9b26cB6";
export const DARKPOOL = "0x6DABb5682A62b3827eE7e0E02F1DACE896AD457a";
export const SOKA_TOKEN = "0x0F69cf1c9F4FF72471701036dd789c934458e630";
// Governance Safe (3-of-5) that owns the 2026-09-25 deployment through the timelock.
export const GOV_SAFE = "0x776652ab08563Ffd39043a259B6d6B5F7dFf1ae2";
// Gov Safe creation transaction from the 2026-09-25 deployment.
export const GOV_SAFE_CREATION_TX = "0x6f8681c8f10b6e094412db0865cd4571a8125f7da0e74336ecfb86d613dca6d5";

export const NOX_SEED_URL = import.meta.env.VITE_NOX_SEED_URL || "https://api.hisoka.io/seed";
export const NOX_RPC_URL = import.meta.env.VITE_NOX_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
export const NOX_REGISTRY_ADDRESS = import.meta.env.VITE_NOX_REGISTRY_ADDRESS || NOX_REGISTRY;
