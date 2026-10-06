import type { BootInfo } from "../useAnonRpcWorker";
import type { BootState } from "../lib/timeline";
import { chainById, explorerAddressUrl, NOX_REGISTRY } from "../lib/config";
import { resolveEntry } from "../lib/entries";
import type { KnownEntry } from "../lib/config";
import { formatBytes, resolverKind } from "../lib/bundle";
import { formatMs } from "../lib/format";
import { ExtLink, KeyValue, Mono, Panel } from "./ui";

export function IdentityPanel({
  info,
  boot,
  extraEntries,
}: {
  info: BootInfo | null;
  boot: BootState;
  extraEntries: readonly KnownEntry[];
}) {
  const chain = info?.chainId != null ? chainById(info.chainId) : undefined;
  const entry = boot.entryLabel ? resolveEntry(boot.entryLabel, extraEntries) : null;

  return (
    <Panel title="Worker identity and entry" testId="identity-panel">
      <KeyValue label="Specifier" testId="info-specifier">
        {info === null ? (
          <span className="text-fg-muted">read at boot</span>
        ) : info.fileName !== null ? (
          <span>
            local, from <Mono>{info.fileName}</Mono>{" "}
            <span className="text-fg-muted text-xs">(address derived from the hash: <Mono>{info.specifier}</Mono>)</span>
          </span>
        ) : chain ? (
          <span className="flex flex-col gap-0.5">
            <ExtLink href={explorerAddressUrl(chain.explorer, info.specifier)}>
              <Mono>{info.specifier}</Mono>
            </ExtLink>
            <span className="text-xs text-fg-muted">on {chain.name} ({chain.id})</span>
          </span>
        ) : (
          <span className="flex flex-col gap-0.5">
            <Mono>{info.specifier}</Mono>
            <span className="text-xs text-fg-muted">on chain {info.chainId}</span>
          </span>
        )}
      </KeyValue>

      <KeyValue label="Bundle keccak-256 (workerHash)" testId="info-hash">
        {info === null ? (
          <span className="text-fg-muted">read at boot</span>
        ) : (
          <span className="flex flex-col gap-0.5">
            <Mono>{info.workerHash}</Mono>
            {chain && info.fileName === null && (
              <span className="text-xs">
                <ExtLink href={`${explorerAddressUrl(chain.explorer, info.specifier)}#events`}>
                  WorkerUpdated history on {new URL(chain.explorer).host}
                </ExtLink>
              </span>
            )}
          </span>
        )}
      </KeyValue>

      <KeyValue label="Bundle source" testId="info-resolver">
        {info === null ? (
          <span className="text-fg-muted">first resolver that serves matching bytes</span>
        ) : info.fileName !== null ? (
          <span>file on this device, run under the same keccak check</span>
        ) : (
          <span className="flex flex-col gap-1">
            {info.resolvers.map((r) => {
              const used = r === info.resolverUsed;
              const outcome = info.outcomes.find((o) => o.resolver === r);
              return (
                <span key={r} className="flex flex-wrap items-baseline gap-x-2">
                  {resolverKind(r) === "http" ? (
                    <ExtLink href={r}>
                      <Mono>{r}</Mono>
                    </ExtLink>
                  ) : (
                    <Mono>{r}</Mono>
                  )}
                  <span className="text-[11px] text-fg-muted">
                    {used && info.bundleBytes !== null
                      ? `used · ${formatBytes(info.bundleBytes)}`
                      : outcome?.kind === "harness"
                        ? "fetched by the harness over KPS"
                        : outcome?.kind === "failed"
                          ? `skipped: ${outcome.reason}`
                          : outcome?.kind === "mismatch"
                            ? "skipped: different bytes"
                            : "fallback"}
                  </span>
                </span>
              );
            })}
            {info.resolvers.length === 0 && <span className="text-fg-muted">none listed</span>}
          </span>
        )}
      </KeyValue>

      <KeyValue label="Active entry (KPS)" testId="active-entry">
        {entry === null ? (
          <span className="text-fg-muted">chosen by the worker at boot</span>
        ) : (
          <span className="flex flex-col gap-0.5">
            <span className="text-fg">
              {entry.name ?? "Nox entry"}
              {entry.parts && (
                <Mono className="ml-2 text-fg-secondary">
                  {entry.parts.host}:{entry.parts.port}
                </Mono>
              )}
              {boot.entryDialMs !== null && (
                <span className="ml-2 text-[11px] text-fg-muted">dialed in {formatMs(boot.entryDialMs)}</span>
              )}
            </span>
            <span className="text-xs text-fg-muted">
              certhash <Mono>{entry.parts?.certhash ?? entry.label}</Mono>
            </span>
          </span>
        )}
      </KeyValue>

      <KeyValue label="Membership source">
        <span className="flex flex-col gap-0.5">
          <ExtLink href={explorerAddressUrl(NOX_REGISTRY.explorer, NOX_REGISTRY.address)}>
            NoxRegistry <Mono>{NOX_REGISTRY.address}</Mono>
          </ExtLink>
          <span className="text-xs text-fg-muted">
            Arbitrum Sepolia; snapshot pinned in the bundle
            {boot.members !== null ? `, ${boot.members} members` : ""}, refreshed through the mixnet after ready
          </span>
        </span>
      </KeyValue>
    </Panel>
  );
}
