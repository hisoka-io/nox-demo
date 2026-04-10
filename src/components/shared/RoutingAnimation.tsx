const STEPS = [
  "Encrypting query...",
  "Routing through hop 1",
  "Mixing at hop 2",
  "Fetching from RPC",
];

export function RoutingAnimation() {
  return (
    <div className="flex justify-center pt-16 pb-8">
      <div className="flex flex-col gap-4">
        {STEPS.map((step, i) => (
          <div
            key={step}
            className="flex items-center gap-3 animate-fade-in-up"
            style={{ animationDelay: `${i * 0.35}s` }}
          >
            <span
              className="w-2 h-2 rounded-full bg-[var(--color-olive)] animate-dot-pulse"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
            <span className="text-sm font-mono text-fg-muted">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
