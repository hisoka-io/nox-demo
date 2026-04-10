export function Footer() {
  return (
    <footer className="border-t border-fg-faint/50 shrink-0">
      <div className="flex items-center justify-between px-4 sm:px-6 h-14 text-xs text-fg-muted">
        <a href="https://hisoka.io" target="_blank" rel="noopener noreferrer" className="font-serif text-lg tracking-normal text-accent/70 hover:text-accent transition-colors">
          hisoka-io
        </a>
        <div className="flex items-center gap-1">
          {[
            { label: "Docs", href: "https://docs.hisoka.io/" },
            { label: "Protocol", href: "https://hisoka.io/nox" },
            { label: "Live Map", href: "https://map.hisoka.io" },
            { label: "GitHub", href: "https://github.com/hisoka-io" },
            { label: "Run a Node", href: "https://github.com/hisoka-io/run-nox" },
          ].map(({ label, href }, i) => (
            <span key={label} className="flex items-center">
              {i > 0 && <span className="text-fg-faint mx-2">|</span>}
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors uppercase tracking-wider text-[11px]"
              >
                {label}
              </a>
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
