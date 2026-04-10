import { useState, useCallback } from "react";
import { AddressInput } from "@/components/shared/AddressInput";
import { ResultCard } from "@/components/shared/ResultCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { HexDisplay } from "@/components/shared/HexDisplay";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { Examples } from "@/components/shared/Examples";
import { RoutingAnimation } from "@/components/shared/RoutingAnimation";
import { useRpcCall } from "@/hooks/useRpcCall";
import { useHttpCall } from "@/hooks/useHttpCall";
import { buildUrl } from "@/lib/blockscout";
import type { Chain } from "@/lib/blockscout";
import { truncateAddress, formatEther } from "@/lib/format";
import { ArrowRight, FileSearch } from "lucide-react";

const EXAMPLE_TX_HASHES = [
  { label: "Recent TX", value: "0x820a1a3b863e215a571558077afba729033ceb47badfa6f7ed30f65781f9f33a" },
];

interface TxResult {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  gasUsed: string;
  gasPrice: string;
  blockNumber: string;
  status: "success" | "failed" | "pending";
  input: string;
  nonce: string;
  latency: number;
}

export function TxLookup({ chain }: { chain: Chain }) {
  const [result, setResult] = useState<TxResult | null>(null);
  const rpc = useRpcCall<Record<string, string>>();
  const http = useHttpCall<Record<string, unknown>>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState<string | undefined>(undefined);

  const isArbSepolia = chain.id === "arbitrum-sepolia";

  const lookupViaRpc = useCallback(async (hash: string): Promise<TxResult> => {
    const start = Date.now();
    const [tx, receipt] = await Promise.all([
      rpc.execute("eth_getTransactionByHash", [hash]),
      rpc.execute("eth_getTransactionReceipt", [hash]),
    ]);
    if (!tx) throw new Error("Transaction not found");

    const isPending = !receipt;
    const isSuccess = receipt?.status === "0x1";

    return {
      hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      gasUsed: receipt?.gasUsed ?? "0x0",
      gasPrice: tx.gasPrice ?? tx.maxFeePerGas ?? "0x0",
      blockNumber: tx.blockNumber ?? "pending",
      status: isPending ? "pending" : isSuccess ? "success" : "failed",
      input: tx.input,
      nonce: tx.nonce,
      latency: Date.now() - start,
    };
  }, [rpc]);

  const lookupViaApi = useCallback(async (hash: string): Promise<TxResult> => {
    const start = Date.now();
    const data = await http.execute(buildUrl(chain, `/transactions/${hash}`), 30_000);
    if (!data) throw new Error("Transaction not found");

    const from = (data.from as Record<string, unknown>)?.hash as string || "";
    const to = (data.to as Record<string, unknown>)?.hash as string || null;
    const fee = (data.fee as Record<string, unknown>)?.value as string || "0";
    const status = data.status === "ok" ? "success" : data.status === null ? "pending" : "failed";

    return {
      hash,
      from,
      to,
      value: String(data.value || "0"),
      gasUsed: String(data.gas_used || "0"),
      gasPrice: fee,
      blockNumber: data.block ? String(data.block) : "pending",
      status: status as TxResult["status"],
      input: String(data.raw_input || "0x"),
      nonce: String(data.nonce || "0"),
      latency: Date.now() - start,
    };
  }, [http, chain]);

  const lookup = useCallback(async (hash: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const txResult = isArbSepolia ? await lookupViaRpc(hash) : await lookupViaApi(hash);
      setResult(txResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [isArbSepolia, lookupViaRpc, lookupViaApi]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-3xl mb-2">Transaction Lookup</h2>
        <p className="text-sm text-fg-muted">
          Check any transaction on {chain.name} without revealing your interest.
          {isArbSepolia ? " Routed via mixnet RPC." : " Routed via mixnet to Blockscout."}
        </p>
      </div>

      <AddressInput
        placeholder="0x transaction hash"
        onSubmit={lookup}
        loading={loading}
        validate="txhash"
        externalValue={inputValue}
      />

      <Examples items={EXAMPLE_TX_HASHES} onSelect={(v) => { setInputValue(v); lookup(v); }} />

      {error && <ErrorDisplay message={error} />}

      {result && (
        <ResultCard title="Transaction" latency={result.latency}>
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <StatusBadge
                variant={result.status === "success" ? "success" : result.status === "failed" ? "error" : "pending"}
              >
                {result.status}
              </StatusBadge>
              {result.blockNumber !== "pending" && (
                <span className="text-sm text-fg-muted font-mono">
                  Block {parseBigInt(result.blockNumber).toLocaleString()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-base">
              <span className="font-mono text-fg-secondary">{truncateAddress(result.from)}</span>
              <ArrowRight size={16} className="text-fg-muted" />
              <span className="font-mono text-fg-secondary">
                {result.to ? truncateAddress(result.to) : "Contract Creation"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-fg-faint pt-4">
              <div>
                <div className="text-xs text-fg-muted uppercase tracking-wider mb-1.5">Value</div>
                <div className="text-sm font-mono">{formatEther(parseBigInt(result.value))} {chain.symbol}</div>
              </div>
              <div>
                <div className="text-xs text-fg-muted uppercase tracking-wider mb-1.5">Gas Used</div>
                <div className="text-sm font-mono">{parseBigInt(result.gasUsed).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-fg-muted uppercase tracking-wider mb-1.5">Nonce</div>
                <div className="text-sm font-mono">{parseBigInt(result.nonce).toLocaleString()}</div>
              </div>
            </div>

            <HexDisplay data={result.input} label="Input Data" />
          </div>
        </ResultCard>
      )}

      {loading && <RoutingAnimation />}

      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileSearch size={36} className="text-fg-faint mb-4" />
          <p className="text-fg-muted text-base">
            Enter a transaction hash to inspect it privately
          </p>
        </div>
      )}
    </div>
  );
}

function parseBigInt(val: string): bigint {
  if (!val || val === "pending") return 0n;
  return BigInt(val);
}
