import { Check, Circle, Loader2, X, AlertTriangle, Minus } from "lucide-react";
import { STEP_ORDER, stepDuration, type BootState, type StepStatus } from "../lib/timeline";
import { Panel } from "./ui";
import { formatMs } from "../lib/format";

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "done":
      return <Check size={14} className="text-success" />;
    case "active":
      return <Loader2 size={14} className="text-accent animate-spin" />;
    case "failed":
      return <X size={14} className="text-error" />;
    case "warn":
      return <AlertTriangle size={14} className="text-warning" />;
    case "skipped":
      return <Minus size={14} className="text-fg-muted" />;
    case "pending":
      return <Circle size={10} className="text-fg-faint" />;
  }
}

export function Timeline({ boot, running }: { boot: BootState; running: boolean }) {
  const total =
    boot.steps.ready.endedAt !== undefined ? Math.round(boot.steps.ready.endedAt - boot.t0) : null;
  return (
    <Panel
      title="Boot timeline"
      testId="boot-timeline"
      aside={
        total !== null ? (
          <span className="text-xs font-mono text-[var(--color-olive)]" data-testid="boot-total">
            ready in {formatMs(total)}
          </span>
        ) : running ? (
          <span className="text-xs text-fg-muted">cold boot in progress…</span>
        ) : null
      }
    >
      <ol className="flex flex-col">
        {STEP_ORDER.map((id) => {
          const step = boot.steps[id];
          const duration = stepDuration(step);
          const offset = step.startedAt !== undefined ? Math.round(step.startedAt - boot.t0) : null;
          return (
            <li
              key={id}
              data-testid={`step-${id}`}
              data-status={step.status}
              className="grid grid-cols-[20px_1fr_auto] gap-x-3 items-start py-2 border-b border-fg-faint/50 last:border-0"
            >
              <span className="flex h-5 items-center justify-center">
                <StatusIcon status={step.status} />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${step.status === "pending" ? "text-fg-muted" : "text-fg"}`}>
                  {step.label}
                  {id === "discovery" && <span className="text-fg-muted text-xs"> (after ready)</span>}
                </span>
                {step.detail && <span className="block text-xs text-fg-muted break-words">{step.detail}</span>}
              </span>
              <span className="text-right font-mono text-[11px] text-fg-muted whitespace-nowrap">
                {duration !== null ? formatMs(duration) : ""}
                {offset !== null && <span className="block text-fg-muted/70">+{formatMs(offset)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {boot.retries > 0 && (
        <p className="mt-3 text-xs text-fg-muted">
          {boot.retries} dial retr{boot.retries === 1 ? "y" : "ies"}: the worker moves on to the next entry by itself.
        </p>
      )}
    </Panel>
  );
}
