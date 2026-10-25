import { useState, useCallback, useRef } from "react";
import type { Hex } from "viem";
import { AddressInput } from "@/components/shared/AddressInput";
import { ResultCard } from "@/components/shared/ResultCard";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { Examples } from "@/components/shared/Examples";
import { RoutingAnimation } from "@/components/shared/RoutingAnimation";
import { useRpcCall } from "@/hooks/useRpcCall";
import { formatTokenBalance, truncateAddress, formatNumber } from "@/lib/format";
import { parseTokenBalances, rpcOptions, tokenBalancesCall } from "@/lib/chains";
import type { Chain, TokenBalance } from "@/lib/chains";
import { Lock, Wallet, AlertTriangle } from "lucide-react";
import { GOV_SAFE, NOX_REGISTRY } from "@/lib/network";

const EXAMPLE_ADDRESSES = [
  { label: "Gov Safe", value: GOV_SAFE },
  { label: "vitalik.eth", value: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  { label: "NoxRegistry", value: NOX_REGISTRY },
];

interface PortfolioData {
  address: string;
  /** Native balance in wei. */
  balance: bigint;
  /** Transactions sent from the address (its nonce), or null when the read failed. */
  sentCount: bigint | null;
  tokens: TokenBalance[];
  /** Set when the token balances could not be read; the native balance is still shown. */
  tokensError: string | null;
  chain: Chain;
  latencyMs: number;
}

export function BalanceLookup({ chain }: { chain: Chain }) {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const lastAddress = useRef<string | null>(null);
  const rpc = useRpcCall<string>();

  // Three reads in parallel, all through the mixnet: the native balance, the
  // nonce, and every listed token balance in one Multicall3 call.
  const readPortfolio = useCallback(async (address: string): Promise<PortfolioData> => {
    const start = Date.now();
    const opts = rpcOptions(chain);
    const [balRes, nonceRes, tokRes] = await Promise.allSettled([
      rpc.execute("eth_getBalance", [address, "latest"], opts),
      rpc.execute("eth_getTransactionCount", [address, "latest"], opts),
      chain.tokens.length > 0
        ? rpc.execute("eth_call", tokenBalancesCall(chain.tokens, address as Hex), opts)
        : Promise.resolve(null),
    ]);

    if (balRes.status === "rejected") {
      throw new Error(`Balance lookup failed: ${errorMessage(balRes.reason)}`);
    }
    if (!balRes.value) throw new Error("RPC returned no balance");

    let tokens: TokenBalance[] = [];
    let tokensError: string | null = null;
    if (tokRes.status === "rejected") {
      tokensError = errorMessage(tokRes.reason);
    } else if (tokRes.value) {
      try {
        tokens = parseTokenBalances(chain.tokens, tokRes.value as Hex);
      } catch (err) {
        tokensError = errorMessage(err);
      }
    }

    return {
      address,
      balance: BigInt(balRes.value),
      sentCount: nonceRes.status === "fulfilled" && nonceRes.value ? BigInt(nonceRes.value) : null,
      tokens,
      tokensError,
      chain,
      latencyMs: Date.now() - start,
    };
  }, [rpc, chain]);

  const lookup = useCallback(async (address: string) => {
    lastAddress.current = address;
    setLoading(true);
    setError(null);
    setPortfolio(null);

    try {
      setPortfolio(await readPortfolio(address));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [readPortfolio]);

  const held = portfolio ? portfolio.tokens.filter((t) => t.balance !== null && t.balance > 0n) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <h2 className="font-serif text-3xl">Portfolio</h2>
        <span className="text-xs uppercase tracking-wider text-fg-muted">{chain.name}</span>
      </div>

      <div className="flex items-center gap-2 text-sm text-[var(--color-olive)]/70">
        <Lock size={13} />
        <span>Every lookup routes through 3 encrypted hops, so the RPC provider never sees your IP</span>
      </div>

      <AddressInput
        placeholder="0x address"
        onSubmit={lookup}
        loading={loading}
        validate="address"
        externalValue={inputValue}
      />

      <Examples items={EXAMPLE_ADDRESSES} onSelect={(v) => { setInputValue(v); lookup(v); }} />

      {error && (
        <ErrorDisplay
          message={error}
          onRetry={() => lastAddress.current && lookup(lastAddress.current)}
        />
      )}

      {portfolio && (
        <>
          <ResultCard title={truncateAddress(portfolio.address)} latency={portfolio.latencyMs}>
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-4xl">{formatTokenBalance(portfolio.balance, portfolio.chain.decimals)}</span>
                <span className="text-fg-muted text-base">{portfolio.chain.symbol}</span>
              </div>

              {portfolio.sentCount !== null && (
                <div className="flex items-center justify-between border-t border-fg-faint pt-4">
                  <span className="text-xs text-fg-muted uppercase tracking-wider">Transactions sent</span>
                  <span className="font-mono text-base">{portfolio.sentCount.toLocaleString()}</span>
                </div>
              )}
            </div>
          </ResultCard>

          <div className="flex flex-col">
            {portfolio.tokensError && (
              <div className="flex items-start gap-2 border border-warning/30 bg-warning/5 px-3 py-2 mb-2 text-xs text-fg-secondary">
                <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                <span className="break-words">
                  Token balances unavailable: {portfolio.tokensError}. Showing the native balance only.
                </span>
              </div>
            )}
            <TokenRow token={{
              symbol: portfolio.chain.symbol,
              name: portfolio.chain.name,
              address: "0x0000000000000000000000000000000000000000",
              decimals: portfolio.chain.decimals,
              balance: portfolio.balance,
            }} native />
            {held.map((token) => (
              <TokenRow key={token.address} token={token} />
            ))}
            {portfolio.chain.tokens.length > 0 && (
              <p className="text-[0.7rem] text-fg-muted pt-3">
                Token balances read on-chain for {portfolio.chain.tokens.map((t) => t.symbol).join(", ")}.
              </p>
            )}
          </div>
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

function TokenRow({ token, native = false }: { token: TokenBalance; native?: boolean }) {
  const amount = parseFloat(formatTokenBalance(token.balance ?? 0n, token.decimals));

  return (
    <div className="flex items-center justify-between py-3 border-b border-fg-faint/50 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        {native ? (
          <svg className="w-7 h-7 shrink-0" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#627EEA" />
            <path d="M16.498 4v8.87l7.497 3.35L16.498 4z" fill="#fff" fillOpacity=".6" />
            <path d="M16.498 4L9 16.22l7.498-3.35V4z" fill="#fff" />
            <path d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z" fill="#fff" fillOpacity=".6" />
            <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.379z" fill="#fff" />
            <path d="M16.498 20.573l7.497-4.353-7.497-3.348v7.701z" fill="#fff" fillOpacity=".2" />
            <path d="M9 16.22l7.498 4.353v-7.701L9 16.22z" fill="#fff" fillOpacity=".6" />
          </svg>
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
        <div className="font-mono text-sm">{formatNumber(amount)}</div>
      </div>
    </div>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
