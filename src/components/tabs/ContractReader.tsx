import { useState, useCallback, useMemo } from "react";
import { AddressInput } from "@/components/shared/AddressInput";
import { ResultCard } from "@/components/shared/ResultCard";
import { HexDisplay } from "@/components/shared/HexDisplay";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { Examples } from "@/components/shared/Examples";
import { RoutingAnimation } from "@/components/shared/RoutingAnimation";
import { useRpcCall } from "@/hooks/useRpcCall";
import { useHttpCall } from "@/hooks/useHttpCall";
import { knownAbi, ERC20_ABI } from "@/lib/abi";
import { DARKPOOL, NOX_REGISTRY, SOKA_TOKEN } from "@/lib/network";
import { DEFAULT_CHAIN, RESPONSE_BUDGET, buildAbiUrl, parseAbiResponse } from "@/lib/blockscout";
import { FileCode2, Play } from "lucide-react";
import { encodeFunctionData, decodeFunctionResult } from "viem";
import type { Abi, AbiFunction } from "viem";

const EXAMPLE_CONTRACTS = [
  { label: "NoxRegistry", value: NOX_REGISTRY },
  { label: "DarkPool", value: DARKPOOL },
  { label: "SOKA", value: SOKA_TOKEN },
];

export function ContractReader() {
  const [contractAddress, setContractAddress] = useState("");
  const [abi, setAbi] = useState<Abi | null>(null);
  const [selectedFn, setSelectedFn] = useState<string>("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [callResult, setCallResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [abiLoading, setAbiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [abiSource, setAbiSource] = useState<"known" | "blockscout" | "erc20-fallback" | null>(null);
  const [abiNote, setAbiNote] = useState<string | null>(null);

  const rpc = useRpcCall<string>();
  const http = useHttpCall<unknown>();

  const viewFunctions = useMemo(() => {
    if (!abi) return [];
    return (abi as AbiFunction[]).filter(
      (f) => f.type === "function" && (f.stateMutability === "view" || f.stateMutability === "pure"),
    );
  }, [abi]);

  const currentFn = useMemo(
    () => viewFunctions.find((f) => f.name === selectedFn),
    [viewFunctions, selectedFn],
  );

  const onAddressSubmit = useCallback(async (addr: string) => {
    setContractAddress(addr);
    setSelectedFn("");
    setCallResult(null);
    setError(null);
    setAbi(null);
    setAbiSource(null);
    setAbiNote(null);

    const known = knownAbi(addr);
    if (known) {
      setAbi(known as Abi);
      setAbiSource("known");
      return;
    }

    // The ABI lookup names the contract, so it goes through the mixnet too.
    setAbiLoading(true);
    try {
      const data = await http.execute(buildAbiUrl(DEFAULT_CHAIN, addr), RESPONSE_BUDGET.abi);
      const fetched = parseAbiResponse(data);
      if (fetched) {
        setAbi(fetched as Abi);
        setAbiSource("blockscout");
      } else {
        setAbi(ERC20_ABI as unknown as Abi);
        setAbiSource("erc20-fallback");
        setAbiNote("Contract not verified on Blockscout -- using ERC-20 ABI fallback");
      }
    } catch (err) {
      setAbi(ERC20_ABI as unknown as Abi);
      setAbiSource("erc20-fallback");
      setAbiNote(
        `ABI lookup failed (${err instanceof Error ? err.message : String(err)}) -- using ERC-20 ABI fallback`,
      );
    } finally {
      setAbiLoading(false);
    }
  }, [http]);

  const executeCall = useCallback(async () => {
    if (!contractAddress || !currentFn || !abi) return;

    setLoading(true);
    setError(null);
    setCallResult(null);

    const start = Date.now();

    try {
      const args = currentFn.inputs.map((input) => {
        const val = inputs[input.name || ""] || "";
        if (input.type.startsWith("uint") || input.type.startsWith("int")) return BigInt(val || "0");
        if (input.type === "bool") return val === "true";
        return val;
      });

      const calldata = encodeFunctionData({ abi, functionName: currentFn.name, args });

      const raw = await rpc.execute("eth_call", [{ to: contractAddress, data: calldata }, "latest"]);
      if (!raw || raw === "0x") throw new Error("Call returned no data (is this a contract with that function?)");

      const elapsed = Date.now() - start;
      setLatency(elapsed);

      try {
        const decoded = decodeFunctionResult({ abi, functionName: currentFn.name, data: raw as `0x${string}` });
        setCallResult(String(decoded));
      } catch {
        setCallResult(raw);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [contractAddress, currentFn, abi, inputs, rpc]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-serif text-2xl mb-1">Contract Reader</h2>
          <p className="text-[0.8rem] text-fg-muted">
            Read any contract function. The call and the ABI lookup both go through the mixnet, so the RPC provider and Blockscout never see your IP.
          </p>
        </div>
        <span className="text-[0.65rem] text-fg-muted uppercase tracking-wider border border-fg-faint px-2 py-1 shrink-0">
          {DEFAULT_CHAIN.name}
        </span>
      </div>

      <AddressInput
        placeholder="0x contract address"
        onSubmit={onAddressSubmit}
        validate="address"
      />

      <Examples items={EXAMPLE_CONTRACTS} onSelect={onAddressSubmit} />

      {contractAddress && abiLoading && (
        <div className="flex items-center gap-2 py-4">
          <span className="inline-block w-4 h-4 border-2 border-fg-muted border-t-transparent rounded-full animate-spin" />
          <span className="text-[0.8rem] text-fg-muted">Fetching contract ABI from Blockscout via the mixnet...</span>
        </div>
      )}

      {contractAddress && abi && !abiLoading && viewFunctions.length === 0 && (
        <div className="text-fg-muted text-[0.8rem] py-4 text-center border border-fg-faint px-4">
          No verified read functions found for this contract.
        </div>
      )}

      {contractAddress && abi && viewFunctions.length > 0 && (
        <div className="flex flex-col gap-4">
          {abiSource === "blockscout" && (
            <p className="text-[0.65rem] text-fg-muted">ABI loaded from Blockscout (verified contract)</p>
          )}
          {abiSource === "erc20-fallback" && abiNote && (
            <p className="text-[0.65rem] text-fg-muted break-words">{abiNote}</p>
          )}
          <div>
            <label className="text-xs text-fg-muted uppercase tracking-wider block mb-2">
              Function
            </label>
            <select
              value={selectedFn}
              onChange={(e) => {
                setSelectedFn(e.target.value);
                setInputs({});
                setCallResult(null);
                setError(null);
              }}
              className="w-full bg-bg-input border border-fg-faint text-fg text-sm px-4 py-3 outline-none font-mono focus:border-accent"
            >
              <option value="">Select a function</option>
              {viewFunctions.map((fn) => (
                <option key={fn.name} value={fn.name}>
                  {fn.name}({fn.inputs.map((i) => i.type).join(", ")})
                </option>
              ))}
            </select>
          </div>

          {currentFn && currentFn.inputs.length > 0 && (
            <div className="flex flex-col gap-3">
              {currentFn.inputs.map((input) => (
                <div key={input.name}>
                  <label className="text-xs text-fg-muted font-mono block mb-1.5">
                    {input.name} ({input.type})
                  </label>
                  <input
                    type="text"
                    value={inputs[input.name || ""] || ""}
                    onChange={(e) => setInputs({ ...inputs, [input.name || ""]: e.target.value })}
                    placeholder={input.type}
                    className="w-full bg-bg-input border border-fg-faint text-fg text-sm px-4 py-2.5 outline-none font-mono focus:border-accent placeholder:text-fg-muted"
                  />
                </div>
              ))}
            </div>
          )}

          {currentFn && (
            <button
              onClick={executeCall}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-3 border border-fg text-fg text-sm font-semibold uppercase tracking-[0.04em] hover:bg-fg hover:text-bg transition-colors disabled:opacity-30"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-fg-muted border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Play size={14} />
                  Call
                </>
              )}
            </button>
          )}

          {loading && <RoutingAnimation />}

          {error && <ErrorDisplay message={error} />}

          {callResult !== null && (
            <ResultCard title={`${selectedFn}() result`} latency={latency}>
              {callResult.startsWith("0x") && callResult.length > 66 ? (
                <HexDisplay data={callResult} defaultOpen />
              ) : (
                <p className="font-mono text-base break-all">{callResult}</p>
              )}
            </ResultCard>
          )}
        </div>
      )}

      {!contractAddress && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileCode2 size={36} className="text-fg-faint mb-4" />
          <p className="text-fg-muted text-base">
            Enter a contract address to read its public functions
          </p>
          <p className="text-fg-muted text-sm mt-2">
            Known contracts: NoxRegistry, DarkPool, ERC-20
          </p>
        </div>
      )}
    </div>
  );
}
