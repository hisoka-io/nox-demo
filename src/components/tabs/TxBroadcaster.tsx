import { useState, useCallback } from "react";
import { ResultCard } from "@/components/shared/ResultCard";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { RoutingAnimation } from "@/components/shared/RoutingAnimation";
import { getClient } from "@/lib/nox";
import { usePacketTracker } from "@/hooks/usePacketTracker";
import { parseBroadcastResponse, parseSignedTxHex } from "@/lib/broadcast";
import { Radio, ExternalLink } from "lucide-react";

interface BroadcastOutcome {
  hash: string;
  /** True when the exit used its default Arb Sepolia provider, so Arbiscan is the right explorer. */
  defaultRoute: boolean;
}

export function TxBroadcaster() {
  const [rawTx, setRawTx] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [outcome, setOutcome] = useState<BroadcastOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const { trackOutbound, trackResponse, trackError } = usePacketTracker();

  const broadcast = useCallback(async () => {
    const txBytes = parseSignedTxHex(rawTx);
    if (!txBytes) {
      setError("Signed transaction must be 0x-prefixed hex with an even number of digits");
      setOutcome(null);
      return;
    }
    const customRpc = rpcUrl.trim() || undefined;

    setLoading(true);
    setError(null);
    setOutcome(null);

    const start = Date.now();
    trackOutbound("eth_sendRawTransaction");

    try {
      const client = await getClient();
      const response = await client.broadcastSignedTransaction(txBytes, customRpc);

      const elapsed = Date.now() - start;
      trackResponse("eth_sendRawTransaction", elapsed);
      setLatency(elapsed);

      const parsed = parseBroadcastResponse(response);
      if (parsed.ok) {
        setOutcome({ hash: parsed.hash, defaultRoute: !customRpc });
      } else {
        setError(`Broadcast failed: ${parsed.error}`);
      }
    } catch (err) {
      trackError("eth_sendRawTransaction");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rawTx, rpcUrl, trackOutbound, trackResponse, trackError]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-3xl mb-2">TX Broadcaster</h2>
        <p className="text-sm text-fg-muted">
          Broadcast a pre-signed transaction. The RPC provider never sees your IP.
        </p>
      </div>

      <div>
        <label className="text-xs text-fg-muted uppercase tracking-wider block mb-2">
          Signed Transaction (hex)
        </label>
        <textarea
          value={rawTx}
          onChange={(e) => setRawTx(e.target.value)}
          placeholder="0x02f8..."
          rows={6}
          spellCheck={false}
          className="w-full bg-bg-input border border-fg-faint text-fg text-sm px-4 py-3 outline-none resize-none focus:border-accent placeholder:text-fg-muted"
        />
      </div>

      <div>
        <label className="text-xs text-fg-muted uppercase tracking-wider block mb-2">
          Custom RPC URL (optional)
        </label>
        <input
          type="text"
          value={rpcUrl}
          onChange={(e) => setRpcUrl(e.target.value)}
          placeholder="Leave empty to use exit node default"
          className="w-full bg-bg-input border border-fg-faint text-fg text-sm px-4 py-3 outline-none font-mono focus:border-accent placeholder:text-fg-muted"
        />
      </div>

      <button
        onClick={broadcast}
        disabled={loading || !rawTx.trim()}
        className="flex items-center justify-center gap-2 px-5 py-3 border border-fg text-fg text-sm font-semibold uppercase tracking-[0.04em] hover:bg-fg hover:text-bg transition-colors disabled:opacity-30"
      >
        {loading ? (
          <span className="inline-block w-4 h-4 border-2 border-fg-muted border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <Radio size={14} />
            Broadcast
          </>
        )}
      </button>

      {loading && <RoutingAnimation />}

      {error && <ErrorDisplay message={error} />}

      {outcome && (
        <ResultCard title="Accepted by RPC" latency={latency}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-fg-secondary break-all">{outcome.hash}</span>
              {outcome.defaultRoute && (
                <a
                  href={`https://sepolia.arbiscan.io/tx/${outcome.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open on Arbiscan (direct link, not routed through the mixnet)"
                  className="shrink-0 text-accent hover:text-accent-light transition-colors"
                >
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
            <p className="text-xs text-fg-muted">
              The RPC accepted the transaction. Check the Transaction tab for its receipt.
            </p>
          </div>
        </ResultCard>
      )}

      {!outcome && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Radio size={36} className="text-fg-faint mb-4" />
          <p className="text-fg-muted text-base">
            Sign a transaction locally, broadcast through the mixnet
          </p>
          <p className="text-fg-muted text-sm mt-2">
            Supports EIP-1559 and legacy transaction formats
          </p>
        </div>
      )}
    </div>
  );
}
