import { Shield, Eye, Globe, ArrowRight } from "lucide-react";

interface AboutProps {
  onDismiss: () => void;
}

export function About({ onDismiss }: AboutProps) {
  return (
    <div className="flex flex-col gap-10 max-w-xl">
      <div>
        <h1 className="font-serif text-4xl sm:text-5xl mb-4">Nox Shield</h1>
        <p className="text-fg-secondary text-base leading-relaxed">
          A private web3 explorer. Every balance check, transaction lookup, and contract call
          routes through the NOX Sphinx mixnet. Your RPC provider never learns which addresses
          you care about.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-fg-faint p-5">
          <Shield size={24} className="text-accent mb-3" />
          <h3 className="text-sm font-semibold mb-1.5">IP Privacy</h3>
          <p className="text-sm text-fg-muted leading-relaxed">
            Queries route through 3 encrypted hops. The RPC provider sees the query but
            never knows who sent it.
          </p>
        </div>
        <div className="border border-fg-faint p-5">
          <Eye size={24} className="text-accent mb-3" />
          <h3 className="text-sm font-semibold mb-1.5">No Tracking</h3>
          <p className="text-sm text-fg-muted leading-relaxed">
            No cookies, no analytics, no fingerprinting. This app makes zero requests
            outside the mixnet.
          </p>
        </div>
        <div className="border border-fg-faint p-5">
          <Globe size={24} className="text-accent mb-3" />
          <h3 className="text-sm font-semibold mb-1.5">Live Network</h3>
          <p className="text-sm text-fg-muted leading-relaxed">
            Connected to 10 NOX nodes on Arbitrum Sepolia. Real Sphinx packets,
            real encryption, real privacy.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <a href="https://hisoka.io" target="_blank" rel="noopener noreferrer"
          className="border border-fg-faint px-4 py-2 text-fg-secondary hover:text-fg hover:border-accent/30 transition-colors">
          hisoka.io
        </a>
        <a href="https://hisoka.io/nox" target="_blank" rel="noopener noreferrer"
          className="border border-fg-faint px-4 py-2 text-fg-secondary hover:text-fg hover:border-accent/30 transition-colors">
          Nox Protocol
        </a>
        <a href="https://map.hisoka.io" target="_blank" rel="noopener noreferrer"
          className="border border-fg-faint px-4 py-2 text-fg-secondary hover:text-fg hover:border-accent/30 transition-colors">
          Live Map
        </a>
        <a href="https://hisoka.io/writing" target="_blank" rel="noopener noreferrer"
          className="border border-fg-faint px-4 py-2 text-fg-secondary hover:text-fg hover:border-accent/30 transition-colors">
          Blog
        </a>
        <a href="https://github.com/hisoka-io" target="_blank" rel="noopener noreferrer"
          className="border border-fg-faint px-4 py-2 text-fg-secondary hover:text-fg hover:border-accent/30 transition-colors">
          GitHub
        </a>
        <a href="https://github.com/hisoka-io/run-nox" target="_blank" rel="noopener noreferrer"
          className="border border-fg-faint px-4 py-2 text-fg-secondary hover:text-fg hover:border-accent/30 transition-colors">
          Run a Node
        </a>
      </div>

      <button
        onClick={onDismiss}
        className="flex items-center gap-2 px-5 py-3 border border-fg text-fg text-sm font-semibold uppercase tracking-[0.04em] hover:bg-fg hover:text-bg transition-colors w-fit"
      >
        Start Exploring <ArrowRight size={16} />
      </button>
    </div>
  );
}
