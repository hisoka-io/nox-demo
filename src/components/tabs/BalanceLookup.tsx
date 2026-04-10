import { useState, useCallback } from "react";
import { AddressInput } from "@/components/shared/AddressInput";
import { ResultCard } from "@/components/shared/ResultCard";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { Examples } from "@/components/shared/Examples";
import { RoutingAnimation } from "@/components/shared/RoutingAnimation";
import { useRpcCall } from "@/hooks/useRpcCall";
import { useHttpCall } from "@/hooks/useHttpCall";
import { formatTokenBalance, truncateAddress, formatUsd, formatNumber } from "@/lib/format";
import {
  buildUrl, parseAddressInfo, parseTokenBalances, parseTransactions,
} from "@/lib/blockscout";
import type { Chain, AddressInfo, TokenBalance, Transaction } from "@/lib/blockscout";
import { Lock, Wallet, ArrowUpRight, ArrowDownLeft } from "lucide-react";

const EXAMPLE_ADDRESSES = [
  { label: "Deployer", value: "0x8F4eB35a24bF75C2C86917d324Cac34EB2EFc534" },
  { label: "vitalik.eth", value: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  { label: "NoxRegistry", value: "0x8626aF80db409BeD3C19871FAdf9b0Ce7Aa641Bc" },
];

type View = "tokens" | "activity";

interface PortfolioData {
  info: AddressInfo;
  tokens: TokenBalance[];
  transactions: Transaction[] | null;
  chain: Chain;
  latencyMs: number;
  txNextPage: Record<string, string> | null;
}

export function BalanceLookup({ chain }: { chain: Chain }) {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [view, setView] = useState<View>("tokens");
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"rpc" | "api">("rpc");

  const [loadingMore, setLoadingMore] = useState(false);
  const rpc = useRpcCall<string>();
  const http = useHttpCall<unknown>();

  const lookupViaRpc = useCallback(async (address: string) => {
    const start = Date.now();
    const ethHex = await rpc.execute("eth_getBalance", [address, "latest"]);
    if (!ethHex) throw new Error("Failed to fetch ETH balance");

    const ethBal = BigInt(ethHex);
    return {
      info: {
        address,
        coinBalance: ethBal.toString(),
        exchangeRate: null,
        ensName: null,
        hasTokens: false,
      } satisfies AddressInfo,
      tokens: [] as TokenBalance[],
      transactions: null,
      chain,
      latencyMs: Date.now() - start,
      txNextPage: null,
    };
  }, [rpc, chain]);

  const lookupViaApi = useCallback(async (address: string) => {
    const start = Date.now();

    const [infoData, tokData] = await Promise.all([
      http.execute(buildUrl(chain, `/addresses/${address}`), 10_000),
      http.execute(buildUrl(chain, `/addresses/${address}/tokens?type=ERC-20`), 200_000),
    ]);

    if (!infoData) throw new Error("Failed to fetch address info");
    const info = parseAddressInfo(infoData as Record<string, unknown>);
    const tokens = tokData ? parseTokenBalances(tokData as Record<string, unknown>[] | Record<string, unknown>) : [];

    return { info, tokens, transactions: null, chain, latencyMs: Date.now() - start, txNextPage: null };
  }, [http, chain]);

  const lookup = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    setPortfolio(null);

    try {
      const result = mode === "api" ? await lookupViaApi(address) : await lookupViaRpc(address);
      setPortfolio(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [mode, lookupViaRpc, lookupViaApi]);

  const loadTransactions = useCallback(async (pageParams?: Record<string, string>) => {
    if (!portfolio) return;
    setLoadingMore(true);
    const qs = pageParams ? `?${new URLSearchParams(pageParams).toString()}` : "";
    const data = await http.execute(buildUrl(portfolio.chain, `/addresses/${portfolio.info.address}/transactions${qs}`), 60_000);
    if (data) {
      const obj = data as Record<string, unknown>;
      const newTxs = parseTransactions(obj);
      const nextPage = obj.next_page_params ? obj.next_page_params as Record<string, string> : null;
      setPortfolio((prev) => {
        if (!prev) return prev;
        const existing = prev.transactions || [];
        return { ...prev, transactions: pageParams ? [...existing, ...newTxs] : newTxs, txNextPage: nextPage };
      });
    }
    setLoadingMore(false);
  }, [portfolio, http]);

  const ethBalanceFormatted = portfolio
    ? formatTokenBalance(BigInt(portfolio.info.coinBalance), 18)
    : "0";

  const ethUsdValue = portfolio?.info.exchangeRate
    ? (parseFloat(ethBalanceFormatted) * parseFloat(portfolio.info.exchangeRate)).toFixed(2)
    : null;

  const totalUsd = portfolio ? calcTotalUsd(portfolio) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <h2 className="font-serif text-3xl">Portfolio</h2>
        <div className="flex border border-fg-faint">
          <button
            onClick={() => setMode("rpc")}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider font-semibold transition-colors ${
              mode === "rpc" ? "bg-fg text-bg" : "text-fg-muted hover:text-fg"
            }`}
          >
            RPC
          </button>
          <button
            onClick={() => setMode("api")}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider font-semibold transition-colors ${
              mode === "api" ? "bg-fg text-bg" : "text-fg-muted hover:text-fg"
            }`}
          >
            Explorer
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-[var(--color-olive)]/70">
        <Lock size={13} />
        <span>Every query routes through 3 encrypted hops - no one can link your IP to this lookup</span>
      </div>

      <AddressInput
        placeholder="0x address or ENS name"
        onSubmit={lookup}
        loading={loading}
        validate="address"
        externalValue={inputValue}
      />

      <Examples items={EXAMPLE_ADDRESSES} onSelect={(v) => { setInputValue(v); lookup(v); }} />

      {error && <ErrorDisplay message={error} onRetry={() => portfolio && lookup(portfolio.info.address)} />}

      {portfolio && (
        <>
          <ResultCard
            title={portfolio.info.ensName || truncateAddress(portfolio.info.address)}
            latency={portfolio.latencyMs}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-4xl">{ethBalanceFormatted}</span>
                <span className="text-fg-muted text-base">{portfolio.chain.symbol}</span>
                {ethUsdValue && (
                  <span className="text-fg-secondary text-base ml-auto">${ethUsdValue}</span>
                )}
              </div>

              {totalUsd && (
                <div className="flex items-center justify-between border-t border-fg-faint pt-4">
                  <span className="text-xs text-fg-muted uppercase tracking-wider">Estimated Total</span>
                  <span className="font-mono text-base">${totalUsd}</span>
                </div>
              )}
            </div>
          </ResultCard>

          {mode === "api" && (
            <div className="flex gap-1 border-b border-fg-faint">
              {(["tokens", "activity"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setView(v);
                    if (v === "activity" && portfolio.transactions === null) loadTransactions();
                  }}
                  className={`px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] transition-colors ${
                    view === v ? "text-fg border-b-2 border-accent" : "text-fg-muted hover:text-fg-secondary"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          {(mode === "rpc" || view === "tokens") && (
            <div className="flex flex-col">
              <TokenRow token={{
                symbol: portfolio.chain.symbol,
                name: portfolio.chain.name,
                address: "native",
                decimals: portfolio.chain.decimals,
                balance: portfolio.info.coinBalance,
                exchangeRate: portfolio.info.exchangeRate,
                marketCap: Infinity,
                type: "native",
                iconUrl: null,
              }} />
              {sortTokensByValue(portfolio.tokens).map((token) => (
                <TokenRow key={token.address} token={token} />
              ))}
            </div>
          )}

          {mode === "api" && view === "activity" && (
            <div className="flex flex-col gap-1">
              {portfolio.transactions === null && loadingMore && (
                <p className="text-fg-muted text-sm py-6 text-center">Loading transactions...</p>
              )}
              {portfolio.transactions !== null && portfolio.transactions.length === 0 && (
                <p className="text-fg-muted text-sm py-6 text-center">No transactions found</p>
              )}
              {portfolio.transactions?.map((tx) => (
                <TxRow key={tx.hash} tx={tx} address={portfolio.info.address} />
              ))}
              {portfolio.txNextPage && (
                <button
                  onClick={() => loadTransactions(portfolio.txNextPage!)}
                  disabled={loadingMore}
                  className="mt-2 w-full py-2.5 text-sm text-accent hover:text-accent-light border border-fg-faint hover:border-accent/30 transition-colors disabled:opacity-30"
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {loading && <RoutingAnimation />}

      {!portfolio && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Wallet size={36} className="text-fg-faint mb-4" />
          <p className="text-fg-muted text-base">
            Paste any address above. Your query is encrypted and routed through the NOX mixnet.
          </p>
        </div>
      )}
    </div>
  );
}

function TokenRow({ token }: { token: TokenBalance }) {
  const rawBalance = parseFloat(formatTokenBalance(BigInt(token.balance), token.decimals));
  const usdVal = token.exchangeRate ? rawBalance * parseFloat(token.exchangeRate) : 0;

  return (
    <div className="flex items-center justify-between py-3 border-b border-fg-faint/50 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        {token.type === "native" ? (
          <svg className="w-7 h-7 shrink-0" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#627EEA" />
            <path d="M16.498 4v8.87l7.497 3.35L16.498 4z" fill="#fff" fillOpacity=".6" />
            <path d="M16.498 4L9 16.22l7.498-3.35V4z" fill="#fff" />
            <path d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z" fill="#fff" fillOpacity=".6" />
            <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.379z" fill="#fff" />
            <path d="M16.498 20.573l7.497-4.353-7.497-3.348v7.701z" fill="#fff" fillOpacity=".2" />
            <path d="M9 16.22l7.498 4.353v-7.701L9 16.22z" fill="#fff" fillOpacity=".6" />
          </svg>
        ) : token.iconUrl ? (
          <img src={token.iconUrl} alt="" className="w-7 h-7 rounded-full shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-bg-hover border border-fg-faint flex items-center justify-center shrink-0">
            <span className="text-xs text-fg-muted font-semibold">{token.symbol.slice(0, 2)}</span>
          </div>
        )}
        <div className="min-w-0">
          <span className="text-sm font-medium">{token.symbol}</span>
          <span className="text-xs text-fg-muted ml-2 hidden sm:inline truncate">{token.name}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-sm">{formatNumber(rawBalance)}</div>
        {usdVal > 0 && <div className="font-mono text-xs text-fg-muted">{formatUsd(usdVal)}</div>}
      </div>
    </div>
  );
}

function tokenUsdValue(t: TokenBalance): number {
  if (!t.exchangeRate) return 0;
  return parseFloat(formatTokenBalance(BigInt(t.balance), t.decimals)) * parseFloat(t.exchangeRate);
}

function sortTokensByValue(tokens: TokenBalance[]): TokenBalance[] {
  return [...tokens]
    .filter((t) => tokenUsdValue(t) >= 1 && t.marketCap > 100_000)
    .sort((a, b) => tokenUsdValue(b) - tokenUsdValue(a));
}

function TxRow({ tx, address }: { tx: Transaction; address: string }) {
  const isSent = tx.from.toLowerCase() === address.toLowerCase();
  const age = tx.timestamp ? timeAgo(tx.timestamp) : "";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-fg-faint/50 last:border-0">
      <div className={`p-2 rounded-sm ${isSent ? "bg-error/10" : "bg-success/10"}`}>
        {isSent ? <ArrowUpRight size={16} className="text-error" /> : <ArrowDownLeft size={16} className="text-success" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{isSent ? "Sent" : "Received"}</span>
          {tx.method && (
            <span className="text-xs text-fg-muted font-mono bg-bg-secondary px-1.5 py-0.5">
              {tx.method}
            </span>
          )}
        </div>
        <div className="text-xs text-fg-muted font-mono mt-0.5">
          {isSent ? `To ${truncateAddress(tx.to || "")}` : `From ${truncateAddress(tx.from)}`}
        </div>
      </div>
      <div className="text-right shrink-0">
        {tx.value !== "0" && (
          <div className="font-mono text-sm">{formatTokenBalance(BigInt(tx.value), 18)} ETH</div>
        )}
        {age && <div className="text-xs text-fg-muted">{age}</div>}
      </div>
    </div>
  );
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function calcTotalUsd(p: PortfolioData): string | null {
  let total = 0;
  if (p.info.exchangeRate) {
    total += parseFloat(formatTokenBalance(BigInt(p.info.coinBalance), 18)) * parseFloat(p.info.exchangeRate);
  }
  for (const t of sortTokensByValue(p.tokens)) {
    total += tokenUsdValue(t);
  }
  return total > 0 ? total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
}
