import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorDisplay({ message, onRetry }: ErrorDisplayProps) {
  return (
    <div className="flex items-start gap-3 border border-error/30 bg-error/5 p-4">
      <AlertTriangle size={18} className="text-error shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-fg-secondary break-words">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 flex items-center gap-1.5 text-sm text-accent hover:text-accent-light transition-colors"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
