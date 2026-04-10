type Variant = "success" | "error" | "pending" | "neutral";

interface StatusBadgeProps {
  variant: Variant;
  children: React.ReactNode;
}

const styles: Record<Variant, string> = {
  success: "border-success text-success",
  error: "border-error text-error",
  pending: "border-accent text-accent",
  neutral: "border-fg-muted text-fg-muted",
};

export function StatusBadge({ variant, children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold uppercase tracking-wider border ${styles[variant]}`}
    >
      {children}
    </span>
  );
}
