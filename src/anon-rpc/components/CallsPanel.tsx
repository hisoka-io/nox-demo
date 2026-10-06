import { useState, type ReactNode } from "react";
import { Shield, Globe, Play } from "lucide-react";
import { CALLS, compareValues, runCall, type CallId, type CallInputs, type CallResult, type FetchLike } from "../lib/calls";
import { isAddress, isHttpUrl, TARGET_PRESETS, targetPresetById, explorerAddressUrl } from "../lib/config";
import { describeError, type ErrorView } from "../lib/errors";
import { formatMs, inputClass } from "../lib/format";
import type { RequestTiming } from "../lib/timeline";
import { hostOf } from "../lib/specifier";
import { Badge, ExtLink, Field, Mono, Panel } from "./ui";

type PathState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "ok"; result: CallResult; startedAt?: number; endedAt?: number }
  | { state: "error"; error: ErrorView };

/** How long after a call settles its `request.timing` log line may still arrive. */
const TIMING_LOG_SLACK_MS = 500;

export type TimingLookup = (since: number, until: number) => RequestTiming | null;

const PHASES: readonly { key: keyof RequestTiming; label: string }[] = [
  { key: "uploadMs", label: "upload" },
  { key: "waitMs", label: "wait" },
  { key: "claimMs", label: "claim" },
  { key: "downloadMs", label: "download" },
  { key: "decodeMs", label: "decode" },
];

function formatKb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/** Per-phase durations of the call's mixnet request (one call runs at a time). */
function PhaseTimings({ timing, testId }: { timing: RequestTiming | null; testId: string }) {
  if (timing === null) {
    return (
      <span className="text-[11px] text-fg-muted" data-testid={testId} data-state="none">
        per-phase timing: worker 0.3 or later
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-fg-muted" data-testid={testId} data-state="shown">
      {PHASES.map(({ key, label }) => {
        const value = timing[key];
        return typeof value === "number" ? (
          <span key={label} data-phase={label}>
            {label} <span className="text-fg-secondary">{formatMs(value)}</span>
          </span>
        ) : null;
      })}
      {timing.claimBytes !== null && (
        <span>
          {formatKb(timing.claimBytes)}
          {timing.format ? ` ${timing.format}` : ""}
        </span>
      )}
    </span>
  );
}

interface Row {
  anon: PathState;
  direct: PathState;
}

const IDLE_ROW: Row = { anon: { state: "idle" }, direct: { state: "idle" } };

function PathCell({
  label,
  icon,
  path,
  testId,
  timing,
}: {
  label: string;
  icon: ReactNode;
  path: PathState;
  testId: string;
  timing?: RequestTiming | null;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0" data-testid={testId} data-state={path.state}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        {icon}
        {label}
        {path.state === "ok" && <span className="ml-auto font-mono normal-case tracking-normal text-[var(--color-olive)]">{formatMs(path.result.ms)}</span>}
      </span>
      {path.state === "idle" && <span className="text-xs text-fg-muted">not run</span>}
      {path.state === "running" && (
        <span className="flex items-center gap-1 text-xs text-fg-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-dot-pulse" />
          in flight…
        </span>
      )}
      {path.state === "ok" && <span className="text-sm text-fg break-words font-mono">{path.result.summary}</span>}
      {path.state === "ok" && timing !== undefined && <PhaseTimings timing={timing} testId={`${testId}-phases`} />}
      {path.state === "error" && (
        <span className="text-xs text-error break-words">
          {path.error.code && (
            <Badge tone="error" testId={`${testId}-code`}>
              {path.error.code}
            </Badge>
          )}{" "}
          {path.error.message}
          {path.error.hint && <span className="block text-fg-muted mt-0.5">{path.error.hint}</span>}
        </span>
      )}
    </div>
  );
}

export function CallsPanel({
  workerFetch,
  ready,
  timingBetween,
}: {
  workerFetch: FetchLike | null;
  ready: boolean;
  timingBetween?: TimingLookup;
}) {
  const [presetId, setPresetId] = useState(TARGET_PRESETS[0].id);
  const preset = targetPresetById(presetId) ?? TARGET_PRESETS[0];
  const [rpcUrl, setRpcUrl] = useState(preset.rpcUrl);
  const [address, setAddress] = useState(preset.sampleAddress);
  const [token, setToken] = useState(preset.token.address);
  const [compare, setCompare] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [rows, setRows] = useState<Record<CallId, Row>>(() =>
    Object.fromEntries(CALLS.map((c) => [c.id, IDLE_ROW])) as Record<CallId, Row>,
  );
  const [inputError, setInputError] = useState<string | null>(null);

  const choosePreset = (id: string) => {
    const next = targetPresetById(id);
    if (!next) return;
    setPresetId(id);
    setRpcUrl(next.rpcUrl);
    setAddress(next.sampleAddress);
    setToken(next.token.address);
  };

  const inputs = (): CallInputs | null => {
    if (!isHttpUrl(rpcUrl.trim())) {
      setInputError("The RPC URL must be http(s)");
      return null;
    }
    if (!isAddress(address.trim())) {
      setInputError("The account must be a 0x address");
      return null;
    }
    if (!isAddress(token.trim())) {
      setInputError("The token must be a 0x address");
      return null;
    }
    setInputError(null);
    const known = token.trim().toLowerCase() === preset.token.address.toLowerCase();
    return {
      address: address.trim(),
      token: known ? preset.token : { address: token.trim(), symbol: "units", decimals: 0 },
    };
  };

  const setPath = (id: CallId, key: keyof Row, path: PathState) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [key]: path } }));
  };

  const run = async (ids: readonly CallId[]) => {
    if (!workerFetch) return;
    const callInputs = inputs();
    if (!callInputs) return;
    const url = rpcUrl.trim();
    const runOne = async (id: CallId) => {
      setRows((prev) => ({
        ...prev,
        [id]: { anon: { state: "running" }, direct: compare ? { state: "running" } : { state: "idle" } },
      }));
      const startedAt = performance.now();
      const anon = runCall(workerFetch, url, id, callInputs).then(
        (result) => setPath(id, "anon", { state: "ok", result, startedAt, endedAt: performance.now() }),
        (error: unknown) => setPath(id, "anon", { state: "error", error: describeError(error) }),
      );
      const direct = compare
        ? runCall(fetch.bind(window), url, id, callInputs).then(
            (result) => setPath(id, "direct", { state: "ok", result }),
            (error: unknown) => setPath(id, "direct", { state: "error", error: describeError(error) }),
          )
        : Promise.resolve();
      await Promise.all([anon, direct]);
    };
    // One call at a time: each call gets the worker's full attention, so the
    // timings shown match what a wallet sees for a single request.
    setBatchRunning(true);
    try {
      for (const id of ids) await runOne(id);
    } finally {
      setBatchRunning(false);
    }
  };

  const busy = batchRunning || Object.values(rows).some((r) => r.anon.state === "running");

  return (
    <Panel
      title="Wallet calls through worker.fetch"
      testId="calls-panel"
      aside={
        <button
          type="button"
          data-testid="call-run-all"
          disabled={!ready || busy}
          onClick={() => void run(CALLS.map((c) => c.id))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-bg text-xs font-semibold uppercase tracking-wider hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play size={12} />
          Run all
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
          <Field label="Chain">
            <select
              data-testid="input-target"
              className={inputClass}
              value={presetId}
              onChange={(e) => choosePreset(e.target.value)}
            >
              {TARGET_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.chainId})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Public RPC URL (the exit node calls it)">
            <input
              data-testid="input-target-rpc"
              className={inputClass}
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              spellCheck={false}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Account for eth_getBalance"
            hint={
              <ExtLink href={explorerAddressUrl(preset.explorer, address.trim() || preset.sampleAddress)}>
                {address.trim().toLowerCase() === preset.sampleAddress.toLowerCase() ? preset.sampleAddressLabel : "view on explorer"}
              </ExtLink>
            }
          >
            <input
              data-testid="input-account"
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              spellCheck={false}
            />
          </Field>
          <Field
            label="ERC-20 token for balanceOf"
            hint={
              token.trim().toLowerCase() === preset.token.address.toLowerCase()
                ? `${preset.token.symbol}, ${preset.token.decimals} decimals`
                : "shown in raw units"
            }
          >
            <input
              data-testid="input-token"
              className={inputClass}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              spellCheck={false}
            />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-xs text-fg-secondary">
          <input
            type="checkbox"
            data-testid="input-compare"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
            className="mt-0.5 accent-[var(--color-accent)]"
          />
          <span>
            Also send each call directly from this browser to <Mono>{hostOf(rpcUrl)}</Mono>, for comparison. The direct call
            shows that RPC this browser's IP address; the Nox column never does.
          </span>
        </label>
        {inputError && (
          <p className="text-sm text-error" role="alert">
            {inputError}
          </p>
        )}
        {!ready && <p className="text-xs text-fg-muted">Boot the worker to run calls through the mixnet.</p>}

        <ul className="flex flex-col gap-3">
          {CALLS.map((call) => {
            const row = rows[call.id];
            const comparison =
              row.anon.state === "ok" && row.direct.state === "ok"
                ? compareValues(call.id, row.anon.result.values, row.direct.result.values)
                : null;
            return (
              <li key={call.id} className="border border-fg-faint" data-testid={`call-${call.id}`}>
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-fg-faint bg-bg-secondary/40">
                  <span className="text-sm font-semibold text-fg">{call.title}</span>
                  <Mono className="text-fg-muted">{call.method}</Mono>
                  {comparison && (
                    <Badge
                      tone={comparison === "different" ? "warning" : "success"}
                      testId={`call-${call.id}-compare`}
                    >
                      {comparison === "same" ? "same result" : comparison === "close" ? "same chain, blocks apart" : "results differ"}
                    </Badge>
                  )}
                  <button
                    type="button"
                    data-testid={`call-${call.id}-run`}
                    disabled={!ready || row.anon.state === "running"}
                    onClick={() => void run([call.id])}
                    className="ml-auto text-xs font-semibold uppercase tracking-wider text-accent hover:text-accent-light disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Run
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
                  <PathCell
                    label="Through Nox"
                    icon={<Shield size={12} className="text-[var(--color-olive)]" />}
                    path={row.anon}
                    testId={`call-${call.id}-anon`}
                    timing={
                      row.anon.state === "ok" && timingBetween && row.anon.startedAt !== undefined && row.anon.endedAt !== undefined
                        ? timingBetween(row.anon.startedAt, row.anon.endedAt + TIMING_LOG_SLACK_MS)
                        : undefined
                    }
                  />
                  <PathCell
                    label="Direct"
                    icon={<Globe size={12} />}
                    path={compare || row.direct.state !== "idle" ? row.direct : { state: "idle" }}
                    testId={`call-${call.id}-direct`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}
