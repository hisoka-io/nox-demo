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
  iconUrl: string | null;
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
      iconUrl: token.icon_url ? String(token.icon_url) : null,
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
