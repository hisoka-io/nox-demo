export interface Chain {
  id: string;
  name: string;
  blockscoutUrl: string;
  symbol: string;
  decimals: number;
}

export const CHAINS: Chain[] = [
  { id: "arbitrum-sepolia", name: "Arb Sepolia", blockscoutUrl: "https://arbitrum-sepolia.blockscout.com", symbol: "ETH", decimals: 18 },
  { id: "ethereum", name: "Ethereum", blockscoutUrl: "https://eth.blockscout.com", symbol: "ETH", decimals: 18 },
  { id: "arbitrum", name: "Arbitrum", blockscoutUrl: "https://arbitrum.blockscout.com", symbol: "ETH", decimals: 18 },
  { id: "base", name: "Base", blockscoutUrl: "https://base.blockscout.com", symbol: "ETH", decimals: 18 },
  { id: "optimism", name: "Optimism", blockscoutUrl: "https://explorer.optimism.io", symbol: "ETH", decimals: 18 },
];

export const DEFAULT_CHAIN = CHAINS[0];

/** The exit node's default RPC is Arb Sepolia, so RPC mode is only accurate there. */
export function supportsRpcMode(chain: Chain): boolean {
  return chain.id === DEFAULT_CHAIN.id;
}

// Reply budgets (bytes) for requests routed through the mixnet. Each budget sets
// how many SURBs ride along with the request; oversized budgets make the request
// much slower, undersized ones get the reply truncated.
export const RESPONSE_BUDGET = {
  addressInfo: 10_000,
  // A full 50-token page is ~27 KB of JSON.
  tokens: 50_000,
  transactions: 60_000,
  transaction: 30_000,
  abi: 40_000,
} as const;

// Blockscout can take 15 s+ on a cold token or activity query for a busy address,
// so these get more than the client's default 30 s round-trip timeout.
export const SLOW_QUERY_TIMEOUT_MS = 60_000;

export interface AddressInfo {
  address: string;
  coinBalance: string;
  exchangeRate: string | null;
  ensName: string | null;
  hasTokens: boolean;
}

export interface TokenBalance {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance: string;
  exchangeRate: string | null;
  marketCap: number;
  type: string;
}

export interface Transaction {
  hash: string;
  method: string | null;
  from: string;
  to: string | null;
  value: string;
  status: string;
  timestamp: string;
  blockNumber: number;
  gasUsed: string;
  fee: string;
}

export interface TokenTransfer {
  txHash: string;
  from: string;
  to: string;
  symbol: string;
  value: string;
  decimals: number;
  timestamp: string;
  type: string;
}

export function parseAddressInfo(data: Record<string, unknown>): AddressInfo {
  return {
    address: String(data.hash || ""),
    coinBalance: String(data.coin_balance || "0"),
    exchangeRate: data.exchange_rate ? String(data.exchange_rate) : null,
    ensName: data.ens_domain_name ? String(data.ens_domain_name) : null,
    hasTokens: Boolean(data.has_tokens),
  };
}

export function parseTokenBalances(data: unknown): TokenBalance[] {
  const obj = data as Record<string, unknown>;
  const items = (Array.isArray(data) ? data : (obj.items || [])) as Record<string, unknown>[];
  return items.slice(0, 50).map((item) => {
    const token = (item.token || {}) as Record<string, unknown>;
    return {
      symbol: String(token.symbol || "???"),
      name: String(token.name || "Unknown"),
      address: String(token.address || ""),
      decimals: Number(token.decimals || 18),
      balance: String(item.value || "0"),
      exchangeRate: token.exchange_rate ? String(token.exchange_rate) : null,
      marketCap: parseFloat(String(token.circulating_market_cap || "0")) || 0,
      type: String(token.type || "ERC-20"),
    };
  });
}

export function parseTransactions(data: Record<string, unknown>): Transaction[] {
  const items = (data.items || []) as Record<string, unknown>[];
  return items.map((tx) => {
    const from = (tx.from || {}) as Record<string, unknown>;
    const to = (tx.to || null) as Record<string, unknown> | null;
    return {
      hash: String(tx.hash || ""),
      method: tx.method ? String(tx.method) : null,
      from: String(from.hash || ""),
      to: to ? String(to.hash || "") : null,
      value: String(tx.value || "0"),
      status: String(tx.status || ""),
      timestamp: String(tx.timestamp || ""),
      blockNumber: Number(tx.block || 0),
      gasUsed: String(tx.gas_used || "0"),
      fee: String((tx.fee as Record<string, unknown>)?.value || "0"),
    };
  });
}

export function parseTokenTransfers(data: Record<string, unknown>): TokenTransfer[] {
  const items = (data.items || []) as Record<string, unknown>[];
  return items.map((t) => {
    const token = (t.token || {}) as Record<string, unknown>;
    const from = (t.from || {}) as Record<string, unknown>;
    const to = (t.to || {}) as Record<string, unknown>;
    const total = (t.total || {}) as Record<string, unknown>;
    return {
      txHash: String(t.transaction_hash || ""),
      from: String(from.hash || ""),
      to: String(to.hash || ""),
      symbol: String(token.symbol || "???"),
      value: String(total.value || "0"),
      decimals: Number(total.decimals || token.decimals || 18),
      timestamp: String(t.timestamp || ""),
      type: String(t.type || ""),
    };
  });
}

export function buildUrl(chain: Chain, path: string): string {
  return `${chain.blockscoutUrl}/api/v2${path}`;
}

/** ABI-only endpoint (Etherscan-compatible); much smaller than /api/v2/smart-contracts. */
export function buildAbiUrl(chain: Chain, address: string): string {
  return `${chain.blockscoutUrl}/api?module=contract&action=getabi&address=${address}`;
}

/** Parses a getabi reply. Returns null when the contract is not verified. */
export function parseAbiResponse(data: unknown): unknown[] | null {
  const obj = (data || {}) as Record<string, unknown>;
  if (String(obj.status) !== "1" || typeof obj.result !== "string") return null;
  try {
    const abi: unknown = JSON.parse(obj.result);
    return Array.isArray(abi) && abi.length > 0 ? abi : null;
  } catch {
    return null;
  }
}
