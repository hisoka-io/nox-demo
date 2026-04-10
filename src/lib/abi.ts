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
  { name: "getRelayer", type: "function", stateMutability: "view", inputs: [{ name: "addr", type: "address" }], outputs: [{ name: "sphinxKey", type: "bytes32" }, { name: "url", type: "string" }, { name: "stake", type: "uint256" }, { name: "role", type: "uint8" }] },
] as const;

export const DARKPOOL_ABI = [
  { name: "getCurrentRoot", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "isKnownRoot", type: "function", stateMutability: "view", inputs: [{ name: "root", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { name: "getTreeDepth", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const KNOWN_ABIS: Record<string, readonly unknown[]> = {
  "0x8626aF80db409BeD3C19871FAdf9b0Ce7Aa641Bc": NOX_REGISTRY_ABI,
  "0x7A3B2A44559A4b66cCA2E207cd8aDE5b23BE6b7B": DARKPOOL_ABI,
  "0x208be235AAB9b8b5d86285b2684c8e6743e662b5": ERC20_ABI,
};
