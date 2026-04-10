import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BalanceLookup } from "@/components/tabs/BalanceLookup";
import { TxLookup } from "@/components/tabs/TxLookup";
import { ContractReader } from "@/components/tabs/ContractReader";
import { TxBroadcaster } from "@/components/tabs/TxBroadcaster";
import { useNoxClient } from "@/hooks/useNoxClient";
import { useTheme } from "@/hooks/useTheme";
import { DEFAULT_CHAIN } from "@/lib/blockscout";
import type { Chain } from "@/lib/blockscout";
import type { Tab } from "@/types";
import { TABS } from "@/types";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("balance");
  const [chain, setChain] = useState<Chain>(DEFAULT_CHAIN);
  const { status, error: connError, reconnect } = useNoxClient();
  const { theme, toggle: toggleTheme } = useTheme();

  const isArbSepolia = chain.id === "arbitrum-sepolia";

  const handleChainChange = (newChain: Chain) => {
    setChain(newChain);
    if (newChain.id !== "arbitrum-sepolia" && (activeTab === "contract" || activeTab === "broadcast")) {
      setActiveTab("balance");
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (e.altKey) {
        const available = TABS.filter((t) => !t.arbSepoliaOnly || isArbSepolia);
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < available.length) {
          e.preventDefault();
          setActiveTab(available[idx].id);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isArbSepolia]);

  return (
    <div className="flex flex-col h-screen bg-bg">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        connectionStatus={status}
        theme={theme}
        onToggleTheme={toggleTheme}
        chain={chain}
        onChainChange={handleChainChange}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {status === "error" && connError && (
            <div className="mb-6 border border-error/30 bg-error/5 p-4 text-sm text-fg-secondary">
              <p>Failed to connect to the mixnet: {connError}</p>
              <button
                onClick={reconnect}
                className="mt-2 text-accent text-sm hover:text-accent-light transition-colors"
              >
                Retry connection
              </button>
            </div>
          )}

          {status === "connecting" && (
            <div className="mb-6 flex items-center gap-3 text-fg-muted text-sm">
              <span className="inline-block w-4 h-4 border-2 border-fg-muted border-t-transparent rounded-full animate-spin" />
              Connecting to NOX mixnet...
            </div>
          )}

          {activeTab === "balance" && <BalanceLookup chain={chain} />}
          {activeTab === "tx" && <TxLookup chain={chain} />}
          {activeTab === "contract" && <ContractReader />}
          {activeTab === "broadcast" && <TxBroadcaster />}
        </div>
      </main>

      <Footer />
    </div>
  );
}
