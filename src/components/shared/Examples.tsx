interface ExamplesProps {
  items: { label: string; value: string }[];
  onSelect: (value: string) => void;
}

export function Examples({ items, onSelect }: ExamplesProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs text-fg-muted uppercase tracking-wider mr-1">Try:</span>
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onSelect(item.value)}
          className="text-sm text-accent hover:text-accent-light transition-colors font-mono border border-fg-faint px-3 py-1 hover:border-accent/30"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
