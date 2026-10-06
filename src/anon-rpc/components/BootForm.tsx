import { useState, type ChangeEvent } from "react";
import { Play, Square, FileCode } from "lucide-react";
import { chainById, HARNESS_VERSION, isAddress, isHttpUrl, parseConfigText, SPECIFIER_CHAINS, type PageDefaults } from "../lib/config";
import { bundleHash, formatBytes } from "../lib/bundle";
import { inputClass } from "../lib/format";
import type { BootRequest, Phase } from "../useAnonRpcWorker";
import { Field, Mono, Panel } from "./ui";

type SourceKind = "specifier" | "file";

interface LoadedFile {
  name: string;
  bytes: Uint8Array;
  hash: string;
}

export function BootForm({
  defaults,
  phase,
  onStart,
  onStop,
  onConfigChange,
}: {
  defaults: PageDefaults;
  phase: Phase;
  onStart: (request: BootRequest) => void;
  onStop: () => void;
  onConfigChange: (config: unknown) => void;
}) {
  const [source, setSource] = useState<SourceKind>("specifier");
  const [specifier, setSpecifier] = useState(defaults.specifier);
  const [chainId, setChainId] = useState(defaults.chainId);
  const [rpcUrl, setRpcUrl] = useState(defaults.specifierRpc);
  const [configText, setConfigText] = useState("");
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const running = phase === "booting" || phase === "ready";
  const chainOptions = chainById(chainId)
    ? SPECIFIER_CHAINS
    : [...SPECIFIER_CHAINS, { id: chainId, name: `Chain ${chainId}`, rpcUrl: "", explorer: "" }];

  const onChain = (e: ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    const previous = chainById(chainId);
    setChainId(id);
    const next = chainById(id);
    // Follow the chain's public RPC unless the user typed their own.
    if (next && (rpcUrl === "" || rpcUrl === previous?.rpcUrl)) setRpcUrl(next.rpcUrl);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    const bytes = new Uint8Array(await picked.arrayBuffer());
    if (bytes.byteLength === 0) {
      setError(`${picked.name} is empty`);
      return;
    }
    setError(null);
    setFile({ name: picked.name, bytes, hash: bundleHash(bytes) });
  };

  const submit = () => {
    let config: unknown;
    try {
      config = parseConfigText(configText);
    } catch (e) {
      setError(`Worker config must be JSON: ${(e as Error).message}`);
      return;
    }
    if (source === "file") {
      if (!file) {
        setError("Choose a worker bundle file first");
        return;
      }
      setError(null);
      onConfigChange(config);
      onStart({ source: { kind: "file", name: file.name, bytes: file.bytes }, config });
      return;
    }
    const address = specifier.trim();
    if (!isAddress(address)) {
      setError("Enter the specifier contract address (0x followed by 40 hex characters)");
      return;
    }
    if (!isHttpUrl(rpcUrl.trim())) {
      setError("The specifier RPC must be an http(s) URL");
      return;
    }
    setError(null);
    onConfigChange(config);
    onStart({ source: { kind: "specifier", address, chainId, rpcUrl: rpcUrl.trim() }, config });
  };

  return (
    <Panel title="Boot the Nox worker" testId="boot-form">
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 border-b border-fg-faint" role="tablist">
          {(
            [
              ["specifier", "Published specifier"],
              ["file", "Bundle file (developer)"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={source === id}
              disabled={running}
              onClick={() => setSource(id)}
              className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors -mb-px ${
                source === id ? "text-fg border-b-2 border-accent" : "text-fg-muted hover:text-fg-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {source === "specifier" ? (
          <>
            <Field label="Specifier address" hint="The IWorkerSpecifier contract that pins the worker's keccak-256 hash (SPEC §4).">
              <input
                data-testid="input-specifier"
                className={inputClass}
                value={specifier}
                onChange={(e) => setSpecifier(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                disabled={running}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
              <Field label="Specifier chain">
                <select
                  data-testid="input-chain"
                  className={inputClass}
                  value={chainId}
                  onChange={onChain}
                  disabled={running}
                >
                  {chainOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="RPC for the specifier read">
                <input
                  data-testid="input-specifier-rpc"
                  className={inputClass}
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                  spellCheck={false}
                  disabled={running}
                />
              </Field>
            </div>
          </>
        ) : (
          <Field
            label="Worker bundle (.js)"
            hint="Runs an unpublished build under the same rules: the page hashes the file, serves it from a blob: URL and answers the two specifier reads itself; the harness checks keccak before running it."
          >
            <span className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3 py-2 border border-fg-faint text-sm text-fg-secondary cursor-pointer hover:border-accent">
                <FileCode size={14} />
                Choose file
                <input
                  data-testid="input-bundle-file"
                  type="file"
                  accept=".js,text/javascript,application/javascript"
                  className="sr-only"
                  onChange={(e) => void onFile(e)}
                  disabled={running}
                />
              </label>
              {file && (
                <span className="text-xs text-fg-muted min-w-0">
                  {file.name}, {formatBytes(file.bytes.byteLength)}, keccak <Mono>{file.hash}</Mono>
                </span>
              )}
            </span>
          </Field>
        )}

        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-fg-muted hover:text-fg-secondary">
            Worker config (optional)
          </summary>
          <div className="mt-2">
            <Field
              label="anonRpcWorker.config (JSON)"
              hint={
                <>
                  Empty boots on the entry anchors pinned in the bundle. Examples:{" "}
                  <Mono>{'{"gateways":["<ip>:15005:<certhash>"]}'}</Mono>, <Mono>{'{"discovery":"snapshot"}'}</Mono>,{" "}
                  <Mono>{'{"logLevel":"debug"}'}</Mono>.
                </>
              }
            >
              <textarea
                data-testid="input-config"
                className={`${inputClass} font-mono text-xs min-h-20`}
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
                spellCheck={false}
                disabled={running}
              />
            </Field>
          </div>
        </details>

        {error && (
          <p className="text-sm text-error" role="alert" data-testid="boot-form-error">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {running ? (
            <button
              type="button"
              data-testid="boot-stop"
              onClick={onStop}
              className="inline-flex items-center gap-2 px-4 py-2 border border-fg-faint text-sm font-semibold uppercase tracking-wider text-fg-secondary hover:border-error hover:text-error transition-colors"
            >
              <Square size={14} />
              Stop worker
            </button>
          ) : (
            <button
              type="button"
              data-testid="boot-start"
              onClick={submit}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-bg text-sm font-semibold uppercase tracking-wider hover:bg-accent-light transition-colors"
            >
              <Play size={14} />
              {phase === "failed" ? "Boot again" : "Boot worker"}
            </button>
          )}
          <span className="text-xs text-fg-muted">
            Harness <Mono>@anon-rpc/browser-harness {HARNESS_VERSION}</Mono>, the version the reference demo pins
          </span>
        </div>
      </div>
    </Panel>
  );
}
