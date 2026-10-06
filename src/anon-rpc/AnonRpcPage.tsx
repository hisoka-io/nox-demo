import { useMemo, useState } from "react";
import { Sun, Moon, ArrowLeft } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Footer } from "@/components/layout/Footer";
import { resolveDefaults } from "./lib/config";
import { configEntries } from "./lib/entries";
import { hintForFailedCode } from "./lib/errors";
import { useAnonRpcWorker, type Phase } from "./useAnonRpcWorker";
import { BootForm } from "./components/BootForm";
import { Timeline } from "./components/Timeline";
import { IdentityPanel } from "./components/IdentityPanel";
import { CallsPanel } from "./components/CallsPanel";
import { PrivacyPanel } from "./components/PrivacyPanel";
import { LogDrawer } from "./components/LogDrawer";
import { Badge } from "./components/ui";

const PHASE_BADGE: Record<Phase, { tone: "neutral" | "pending" | "success" | "error"; text: string }> = {
  idle: { tone: "neutral", text: "idle" },
  booting: { tone: "pending", text: "booting" },
  ready: { tone: "success", text: "ready" },
  failed: { tone: "error", text: "failed" },
};

export default function AnonRpcPage() {
  const { theme, toggle } = useTheme();
  const defaults = useMemo(() => resolveDefaults(import.meta.env, window.location.search), []);
  const { phase, boot, info, logs, worker, start, stop } = useAnonRpcWorker();
  const [config, setConfig] = useState<unknown>(undefined);
  const extraEntries = useMemo(() => configEntries(config), [config]);
  const badge = PHASE_BADGE[phase];

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="border-b border-fg-faint px-4 sm:px-6 h-14 flex items-center gap-3 shrink-0">
        <a
          href="/"
          className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted hover:text-fg transition-colors"
          title="Back to the Nox Explorer"
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Explorer</span>
        </a>
        <span className="font-serif text-xl sm:text-2xl tracking-normal truncate">Nox anon-rpc</span>
        <Badge tone={badge.tone} testId="boot-phase">
          {badge.text}
        </Badge>
        <button
          onClick={toggle}
          className="ml-auto p-2 text-fg-muted hover:text-fg transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        <section className="flex flex-col gap-2 max-w-3xl">
          <h1 className="font-serif text-3xl sm:text-4xl leading-tight">A wallet RPC through the Nox mixnet, from a cold browser</h1>
          <p className="text-sm sm:text-base text-fg-secondary leading-relaxed">
            This page loads the reference <span className="font-mono text-sm">anon-rpc</span> browser harness, reads the
            Nox worker's specifier on chain, checks the bundle's keccak-256, and runs it in a sandbox. The worker dials a
            Nox entry node over KPS (WebRTC with a pinned certificate hash), then every <span className="font-mono text-sm">fetch</span>{" "}
            becomes Sphinx packets through entry, mix and exit. The worker itself needs no seed server, indexer or DNS lookup.
          </p>
        </section>

        {phase === "failed" && boot.failure && (
          <div className="border border-error/30 bg-error/5 p-4 text-sm" role="alert" data-testid="boot-error">
            <p className="text-fg">
              {boot.failure.code && (
                <Badge tone="error" testId="boot-error-code">
                  {boot.failure.code}
                </Badge>
              )}{" "}
              <span className="text-fg-secondary break-words">{boot.failure.message}</span>
            </p>
            {hintForFailedCode(boot.failure.code) && (
              <p className="mt-1 text-xs text-fg-muted">{hintForFailedCode(boot.failure.code)}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="flex flex-col gap-6 min-w-0">
            <BootForm defaults={defaults} phase={phase} onStart={(r) => void start(r)} onStop={stop} onConfigChange={setConfig} />
            <Timeline boot={boot} running={phase === "booting"} />
          </div>
          <div className="flex flex-col gap-6 min-w-0">
            <IdentityPanel info={info} boot={boot} extraEntries={extraEntries} />
            <PrivacyPanel />
          </div>
        </div>

        <CallsPanel workerFetch={worker ? worker.fetch : null} ready={phase === "ready"} />
        <LogDrawer logs={logs} t0={boot.t0} />
      </main>

      <Footer />
    </div>
  );
}
