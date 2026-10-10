import { Panel } from "./ui";

const HOPS: { who: string; sees: string; tone: string }[] = [
  {
    who: "Entry node",
    sees: "Your IP address and fixed-size encrypted Sphinx packets. It forwards them without being able to read the request or learn where it goes.",
    tone: "var(--color-node-entry)",
  },
  {
    who: "Mix node",
    sees: "Packets from the entry, delayed and reordered with everyone else's. It knows only its neighbours.",
    tone: "var(--color-node-mix)",
  },
  {
    who: "Exit node",
    sees: "For https calls: the RPC provider's host name and the size and timing of the TLS records it relays, and never who sent them. The request and the reply stay encrypted between the worker and the provider; the reply travels back over single-use reply blocks (SURBs).",
    tone: "var(--color-node-exit)",
  },
  {
    who: "RPC provider",
    sees: "The exit node's IP address and the request, over a TLS session that ends inside the worker. Your IP address stays with the entry.",
    tone: "var(--color-fg-muted)",
  },
];

export function PrivacyPanel() {
  return (
    <Panel title="Who sees what" testId="privacy-panel">
      <div className="flex flex-col gap-4">
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {HOPS.map((hop, i) => (
            <li key={hop.who} className="border border-fg-faint p-3 flex flex-col gap-1">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: hop.tone }}>
                <span
                  className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]"
                  style={{ borderColor: hop.tone }}
                >
                  {i + 1}
                </span>
                {hop.who}
              </span>
              <span className="text-sm text-fg-secondary leading-relaxed">{hop.sees}</span>
            </li>
          ))}
        </ol>
        <ul className="flex flex-col gap-2 text-sm text-fg-secondary leading-relaxed list-disc pl-5">
          <li>
            <strong className="text-fg">Code integrity.</strong> The bundle runs only when its keccak-256 equals the
            specifier's <code className="font-mono text-xs">workerHash()</code>. It runs in a null-origin sandboxed
            iframe, and the Nox bundle reaches the network only through the harness's KPS dialer.
          </li>
          <li>
            <strong className="text-fg">Membership.</strong> Node identities come from NoxRegistry. After ready the
            worker re-reads the registry through the mixnet itself, from two exits to two RPC providers, and uses the
            answer only when both agree byte for byte.
          </li>
          <li>
            <strong className="text-fg">Specifier read.</strong> Booting starts with two public contract reads from
            this page to the RPC you choose; a wallet can make them from its own node.
          </li>
          <li>
            <strong className="text-fg">End-to-end TLS.</strong> From worker 0.4 the worker runs TLS 1.3 itself
            (rustls, compiled to WebAssembly inside the bundle) and checks the provider's certificate against the
            Mozilla root store shipped in the bundle. Each call uses its own TLS session by default. Each call below
            shows the transport it used.
          </li>
        </ul>
      </div>
    </Panel>
  );
}
