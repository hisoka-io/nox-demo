import { formatLatency } from "@/lib/format";
import { Shield } from "lucide-react";

interface ResultCardProps {
  title: string;
  latency?: number | null;
  children: React.ReactNode;
}

export function ResultCard({ title, latency, children }: ResultCardProps) {
  return (
    <div className="border border-fg-faint bg-bg-card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-fg-faint">
        <span className="text-sm font-semibold uppercase tracking-[0.06em] text-fg-secondary">
          {title}
        </span>
        {latency != null && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-olive)] font-mono bg-[var(--color-olive)]/8 px-2.5 py-1">
            <Shield size={12} />
            Routed privately in {formatLatency(latency)}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
