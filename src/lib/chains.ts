// Chains the Explorer reads, and how it reads them.
//
// Every lookup is a JSON-RPC call that the exit node makes on the page's behalf:
// Arb Sepolia goes to the exit's own provider, the other chains to the public
// endpoint named here (the exit validates and pins it). Each endpoint serves
// transactions and receipts from any block, so old hashes resolve too. Balances, the account
// nonce, token balances (one Multicall3 call) and transactions all come from
// the chain itself, so no explorer API sits in the path.
import { decodeFunctionResult, encodeFunctionData, type Hex } from "viem";
import { SOKA_TOKEN } from "@/lib/network";

export interface TokenRef {
  symbol: string;
  name: string;
  address: Hex;
  decimals: number;
}

export interface Chain {
  id: string;
  name: string;
  chainId: number;
  /** Public RPC the exit queries for this chain; undefined uses the exit's default provider (Arb Sepolia). */
  rpcUrl?: string;
  symbol: string;
  decimals: number;
  /** ERC-20 tokens whose balances the Balance tab reads. */
  tokens: TokenRef[];
}

/** Multicall3, deployed at the same address on every chain listed here. */
export const MULTICALL3: Hex = "0xcA11bde05977b3631167028862bE2a173976CA11";

const WETH_OP_STACK: Hex = "0x4200000000000000000000000000000000000006";

export const CHAINS: Chain[] = [
  {
    id: "arbitrum-sepolia", name: "Arb Sepolia", chainId: 421614, symbol: "ETH", decimals: 18,
    tokens: [
      { symbol: "SOKA", name: "Soka", address: SOKA_TOKEN as Hex, decimals: 18 },
      { symbol: "USDC", name: "USD Coin", address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", decimals: 6 },
    ],
  },
  {
    id: "ethereum", name: "Ethereum", chainId: 1, rpcUrl: "https://eth.drpc.org", symbol: "ETH", decimals: 18,
    tokens: [
      { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      { symbol: "USDT", name: "Tether USD", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
      { symbol: "DAI", name: "Dai Stablecoin", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
      { symbol: "WETH", name: "Wrapped Ether", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
      { symbol: "WBTC", name: "Wrapped BTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
      { symbol: "LINK", name: "ChainLink Token", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
    ],
  },
  {
    id: "arbitrum", name: "Arbitrum", chainId: 42161, rpcUrl: "https://arb1.arbitrum.io/rpc", symbol: "ETH", decimals: 18,
    tokens: [
      { symbol: "USDC", name: "USD Coin", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
      { symbol: "USD₮0", name: "USD₮0", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
      { symbol: "WETH", name: "Wrapped Ether", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
      { symbol: "ARB", name: "Arbitrum", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 },
      { symbol: "DAI", name: "Dai Stablecoin", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
    ],
  },
  {
    id: "base", name: "Base", chainId: 8453, rpcUrl: "https://mainnet.base.org", symbol: "ETH", decimals: 18,
    tokens: [
      { symbol: "USDC", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
      { symbol: "WETH", name: "Wrapped Ether", address: WETH_OP_STACK, decimals: 18 },
      { symbol: "DAI", name: "Dai Stablecoin", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
      { symbol: "cbBTC", name: "Coinbase Wrapped BTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
    ],
  },
  {
    id: "optimism", name: "Optimism", chainId: 10, rpcUrl: "https://mainnet.optimism.io", symbol: "ETH", decimals: 18,
    tokens: [
      { symbol: "USDC", name: "USD Coin", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
      { symbol: "USDT", name: "Tether USD", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
      { symbol: "WETH", name: "Wrapped Ether", address: WETH_OP_STACK, decimals: 18 },
      { symbol: "OP", name: "Optimism", address: "0x4200000000000000000000000000000000000042", decimals: 18 },
      { symbol: "DAI", name: "Dai Stablecoin", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
    ],
  },
];

export const DEFAULT_CHAIN = CHAINS[0];

/** RPC options for a chain: its public endpoint, or none for the exit's default provider. */
export function rpcOptions(chain: Chain): { rpcUrl: string } | undefined {
  return chain.rpcUrl ? { rpcUrl: chain.rpcUrl } : undefined;
}

// Reply budgets (bytes) for requests routed through the mixnet. Each budget sets
// how many SURBs ride along with the request; oversized budgets make the request
// much slower, undersized ones get the reply truncated.
export const RESPONSE_BUDGET = {
  /** A verified ABI from Sourcify (NoxRegistry's proxy ABI is ~3 KB; large contracts reach ~30 KB). */
  abi: 40_000,
} as const;

export const MULTICALL3_ABI = [
  {
    name: "aggregate3", type: "function", stateMutability: "payable",
    inputs: [{
      name: "calls", type: "tuple[]",
      components: [
        { name: "target", type: "address" },
        { name: "allowFailure", type: "bool" },
        { name: "callData", type: "bytes" },
      ],
    }],
    outputs: [{
      name: "returnData", type: "tuple[]",
      components: [
        { name: "success", type: "bool" },
        { name: "returnData", type: "bytes" },
      ],
    }],
  },
] as const;

const BALANCE_OF_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** `eth_call` params that read every token balance of `owner` in one Multicall3 call. */
export function tokenBalancesCall(tokens: TokenRef[], owner: Hex): [{ to: Hex; data: Hex }, "latest"] {
  const callData = encodeFunctionData({ abi: BALANCE_OF_ABI, functionName: "balanceOf", args: [owner] });
  const data = encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    args: [tokens.map((t) => ({ target: t.address, allowFailure: true, callData }))],
  });
  return [{ to: MULTICALL3, data }, "latest"];
}

export interface TokenBalance extends TokenRef {
  /** Raw balance in the token's smallest unit, or null when the token call reverted. */
  balance: bigint | null;
}

/** Decodes the Multicall3 reply from `tokenBalancesCall`, in token order. */
export function parseTokenBalances(tokens: TokenRef[], raw: Hex): TokenBalance[] {
  const results = decodeFunctionResult({ abi: MULTICALL3_ABI, functionName: "aggregate3", data: raw });
  if (results.length !== tokens.length) {
    throw new Error(`Multicall3 returned ${results.length} results for ${tokens.length} tokens`);
  }
  return tokens.map((token, i) => {
    const { success, returnData } = results[i];
    if (!success || returnData.length !== 66) return { ...token, balance: null };
    return { ...token, balance: BigInt(returnData) };
  });
}

/** Sourcify v2 lookup for a contract's ABI (keyless, served to API clients). */
export function buildAbiUrl(chain: Chain, address: string): string {
  return `https://sourcify.dev/server/v2/contract/${chain.chainId}/${address}?fields=abi`;
}

/** Parses a Sourcify v2 reply. Returns null when it holds no usable ABI. */
export function parseAbiResponse(data: unknown): unknown[] | null {
  const abi = (data && typeof data === "object" ? (data as Record<string, unknown>).abi : undefined);
  return Array.isArray(abi) && abi.length > 0 ? abi : null;
}
