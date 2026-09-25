import { DARKPOOL, NOX_REGISTRY, SOKA_TOKEN } from "@/lib/network";

export const ERC20_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const NOX_REGISTRY_ABI = [
  { name: "relayerCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "topologyFingerprint", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "relayers", type: "function", stateMutability: "view", inputs: [{ name: "relayer", type: "address" }], outputs: [{ name: "sphinxKey", type: "bytes32" }, { name: "url", type: "string" }, { name: "ingressUrl", type: "string" }, { name: "metadataUrl", type: "string" }, { name: "stakedAmount", type: "uint256" }, { name: "unlockTime", type: "uint256" }, { name: "isRegistered", type: "bool" }, { name: "status", type: "uint8" }, { name: "frozen", type: "bool" }] },
  { name: "getNodeRole", type: "function", stateMutability: "view", inputs: [{ name: "relayer", type: "address" }], outputs: [{ type: "uint8" }] },
] as const;

export const DARKPOOL_ABI = [
  { name: "getCurrentRoot", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "isKnownRoot", type: "function", stateMutability: "view", inputs: [{ name: "root", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { name: "getNextLeafIndex", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const KNOWN_ABIS: Record<string, readonly unknown[]> = {
  [NOX_REGISTRY]: NOX_REGISTRY_ABI,
  [DARKPOOL]: DARKPOOL_ABI,
  [SOKA_TOKEN]: ERC20_ABI,
};
