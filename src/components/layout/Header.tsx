import { useState, useRef, useEffect } from "react";
import { type Tab, TABS } from "@/types";
import type { ConnectionStatus } from "@/hooks/useNoxClient";
import { useTopology } from "@/hooks/useTopology";
import { usePacketTracker } from "@/hooks/usePacketTracker";
import { CHAINS } from "@/lib/blockscout";
import type { Chain } from "@/lib/blockscout";
import { Sun, Moon, Globe } from "lucide-react";

type Theme = "dark" | "light";

interface HeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  connectionStatus: ConnectionStatus;
  theme: Theme;
  onToggleTheme: () => void;
  chain: Chain;
  onChainChange: (chain: Chain) => void;
}

export function Header({ activeTab, onTabChange, connectionStatus, theme, onToggleTheme, chain, onChainChange }: HeaderProps) {
  const [showPanel, setShowPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { nodeCount } = useTopology();
  const { totalSent, totalReceived } = usePacketTracker();

  useEffect(() => {
    if (!showPanel) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        toggleRef.current && !toggleRef.current.contains(e.target as Node)
      ) {
        setShowPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPanel]);

  return (
    <header className="relative grid grid-cols-[1fr_auto_1fr] items-center border-b border-fg-faint px-4 sm:px-6 h-14 shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-serif text-2xl tracking-normal">Nox Explorer</span>
        <StatusDot status={connectionStatus} />
      </div>

      <nav className="flex items-center gap-0.5 sm:gap-1">
        {TABS.map((tab) => {
          const disabled = tab.arbSepoliaOnly && chain.id !== "arbitrum-sepolia";
          return (
            <button
              key={tab.id}
              onClick={() => !disabled && onTabChange(tab.id)}
              title={disabled ? `${tab.label} - available on Arb Sepolia` : undefined}
              className={`relative px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold uppercase tracking-[0.04em] sm:tracking-[0.06em] transition-colors ${
                disabled
                  ? "text-fg-muted/40 cursor-not-allowed"
                  : activeTab === tab.id
                    ? "text-fg border-b-2 border-accent"
                    : "text-fg-muted hover:text-fg-secondary"
              }`}
            >
              {tab.label}
              {disabled && (
                <span className="absolute -top-1 -right-1 text-[8px] text-accent font-normal normal-case tracking-normal">soon</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 justify-end">
        <select
          value={chain.id}
          onChange={(e) => {
            const c = CHAINS.find((ch) => ch.id === e.target.value);
            if (c) onChainChange(c);
          }}
          className="bg-bg-input border border-fg-faint text-fg text-xs px-2 py-1.5 outline-none font-sans uppercase tracking-wider focus:border-accent"
        >
          {CHAINS.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <button
          onClick={onToggleTheme}
          className="p-2 text-fg-muted hover:text-fg transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button
          ref={toggleRef}
          onClick={() => setShowPanel(!showPanel)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-fg-muted border border-fg-faint hover:border-fg-muted/50 transition-colors"
        >
          <Globe size={13} />
          <span>{nodeCount} nodes</span>
          <span className="flex gap-1 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-olive)] animate-dot-pulse" style={{ animationDelay: "0s" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-olive)] animate-dot-pulse" style={{ animationDelay: "0.2s" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-olive)] animate-dot-pulse" style={{ animationDelay: "0.4s" }} />
          </span>
        </button>
      </div>

      {showPanel && (
        <div ref={panelRef} className="absolute top-14 right-0 w-72 bg-bg-card border border-fg-faint z-50 animate-slide-down">
          <div className="flex items-center justify-between px-4 py-3 border-b border-fg-faint">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-secondary">Mixnet Status</span>
            <button onClick={() => setShowPanel(false)} className="text-fg-muted hover:text-fg text-lg leading-none">&times;</button>
          </div>
          <div className="px-4 py-3 flex flex-col gap-2">
            <StatRow label="Network" value={chain.name} />
            <StatRow label="Active Nodes" value={String(nodeCount)} />
            <StatRow label="Encrypted Hops" value="3" />
            <StatRow label="Packets Sent" value={String(totalSent)} />
            <StatRow label="Responses" value={String(totalReceived)} />
          </div>
          <div className="px-4 pb-4 pt-2">
            <div className="flex items-center justify-center gap-1.5 py-3 border-t border-fg-faint">
              <RouteLabel text="YOU" />
              <RouteLine />
              <RouteNode letter="E" />
              <RouteLine />
              <RouteNode letter="M" />
              <RouteLine />
              <RouteNode letter="X" />
              <RouteLine />
              <RouteLabel text="RPC" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    disconnected: "bg-fg-muted",
    connecting: "bg-warning animate-pulse",
    connected: "bg-success",
    error: "bg-error",
  };

  const labels: Record<ConnectionStatus, string> = {
    disconnected: "Offline",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Failed",
  };

  return (
    <div className="flex items-center gap-1.5" title={labels[status]}>
      <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span className="hidden sm:inline text-xs text-fg-muted uppercase tracking-wider">
        {labels[status]}
      </span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-fg-faint/50 last:border-0">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="text-xs text-fg-secondary font-mono">{value}</span>
    </div>
  );
}

function RouteLabel({ text }: { text: string }) {
  return <span className="text-[9px] font-semibold tracking-widest text-[var(--color-olive)]">{text}</span>;
}

function RouteLine() {
  return <span className="w-5 h-px bg-[var(--color-olive)]/30" />;
}

function RouteNode({ letter }: { letter: string }) {
  return (
    <span className="w-6 h-6 rounded-full border border-[var(--color-olive)]/30 flex items-center justify-center text-[9px] font-semibold text-[var(--color-olive)]">
      {letter}
    </span>
  );
}
