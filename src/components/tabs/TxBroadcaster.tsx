import { useState, useCallback } from "react";
import { ResultCard } from "@/components/shared/ResultCard";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { RoutingAnimation } from "@/components/shared/RoutingAnimation";
import { getClient } from "@/lib/nox";
import { usePacketTracker } from "@/hooks/usePacketTracker";
import { Radio, ExternalLink } from "lucide-react";

export function TxBroadcaster() {
  const [rawTx, setRawTx] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const { trackOutbound, trackResponse, trackError } = usePacketTracker();

  const broadcast = useCallback(async () => {
    const trimmed = rawTx.trim();
    if (!trimmed.startsWith("0x")) {
      setError("Signed transaction must start with 0x");
      return;
    }

    setLoading(true);
    setError(null);
    setTxHash(null);

    const start = Date.now();
    trackOutbound("eth_sendRawTransaction");

    try {
      const client = await getClient();
      const txBytes = new Uint8Array(
        (trimmed.slice(2).match(/.{2}/g) || []).map((b) => parseInt(b, 16)),
      );

      const result = await client.broadcastSignedTransaction(
        txBytes,
        rpcUrl.trim() || undefined,
      );

      const elapsed = Date.now() - start;
      trackResponse("eth_sendRawTransaction", elapsed);
      setLatency(elapsed);

      const hashHex = "0x" + Array.from(result).map((b) => b.toString(16).padStart(2, "0")).join("");
      setTxHash(hashHex);
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

      {txHash && (
        <ResultCard title="Broadcasted" latency={latency}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-fg-secondary break-all">{txHash}</span>
            <a
              href={`https://sepolia.arbiscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-accent hover:text-accent-light transition-colors"
            >
              <ExternalLink size={16} />
            </a>
          </div>
        </ResultCard>
      )}

      {!txHash && !loading && !error && (
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
