import { useEffect, useRef } from "react";
import type { LogLine } from "../useAnonRpcWorker";
import { Panel } from "./ui";

const levelClass: Record<LogLine["level"], string> = {
  debug: "text-fg-muted",
  info: "text-fg-secondary",
  warn: "text-warning",
  error: "text-error",
};

export function LogDrawer({ logs, t0 }: { logs: LogLine[]; t0: number }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Follow new lines only when the reader is already at the bottom.
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <Panel
      title="Worker log"
      testId="log-panel"
      aside={<span className="text-xs text-fg-muted font-mono">{logs.length} lines</span>}
    >
      <p className="text-xs text-fg-muted mb-3">
        Lines tagged <span className="font-mono">worker</span> come from the hash-pinned bundle through the harness's
        SPEC §13 log; the worker logs event names and counts, never URLs, bodies or keys.
      </p>
      <div
        ref={listRef}
        className="max-h-72 overflow-y-auto border border-fg-faint bg-bg-input p-2 font-mono text-[11px] leading-relaxed"
        data-testid="log-lines"
      >
        {logs.length === 0 && <span className="text-fg-muted">No log lines yet.</span>}
        {logs.map((line) => (
          <div key={line.id} className="grid grid-cols-[4.5rem_3.5rem_1fr] gap-2">
            <span className="text-fg-muted">+{((line.at - t0) / 1000).toFixed(2)}s</span>
            <span className={line.source === "worker" ? "text-[var(--color-olive)]" : "text-fg-muted"}>{line.source}</span>
            <span className={`${levelClass[line.level]} break-all`}>{line.text}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
