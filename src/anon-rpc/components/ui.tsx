import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

export function Panel({ title, aside, children, testId }: { title: string; aside?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="border border-fg-faint bg-bg-card min-w-0" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-fg-faint">
        <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-fg-secondary">{title}</h2>
        {aside}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-muted leading-relaxed">{hint}</span>}
    </label>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-xs break-all ${className}`}>{children}</span>;
}

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-accent hover:text-accent-light transition-colors break-all"
    >
      {children}
      <ExternalLink size={11} className="shrink-0" />
    </a>
  );
}

export function KeyValue({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-fg-faint/60 last:border-0 min-w-0" data-testid={testId}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{label}</span>
      <div className="text-sm text-fg-secondary min-w-0">{children}</div>
    </div>
  );
}

type Tone = "success" | "error" | "pending" | "neutral" | "warning";

const toneClass: Record<Tone, string> = {
  success: "border-success text-success",
  error: "border-error text-error",
  pending: "border-accent text-accent",
  neutral: "border-fg-muted text-fg-muted",
  warning: "border-warning text-warning",
};

export function Badge({ tone, children, testId }: { tone: Tone; children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider border ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
