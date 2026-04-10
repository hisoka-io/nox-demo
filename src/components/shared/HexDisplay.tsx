import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

interface HexDisplayProps {
  data: string;
  label?: string;
  defaultOpen?: boolean;
}

export function HexDisplay({ data, label = "Data", defaultOpen = false }: HexDisplayProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!data || data === "0x") return null;

  return (
    <div className="border border-fg-faint">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-fg-secondary hover:text-fg transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-fg-muted ml-auto font-mono text-xs">
          {data.length > 10 ? `${data.length} chars` : data}
        </span>
      </button>
      {open && (
        <div className="relative border-t border-fg-faint">
          <pre className="p-4 text-sm font-mono text-fg-secondary break-all whitespace-pre-wrap max-h-48 overflow-auto">
            {data}
          </pre>
          <button
            onClick={copy}
            className="absolute top-2.5 right-2.5 p-1.5 text-fg-muted hover:text-fg transition-colors"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}
