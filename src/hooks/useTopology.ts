import { useState, useEffect } from "react";

export interface TopologyNode {
  id: string;
  address: string;
  routingAddress: string;
  publicKey: string;
  layer: number;
  role: number;
}

interface Topology {
  nodes: TopologyNode[];
  fingerprint: string;
}

const SEED_URL = "https://api.hisoka.io/seed/topology";
const REFRESH_INTERVAL = 60_000;

function layersForRole(role: number): number[] {
  if (role === 1) return [0, 1];
  return [0, 1, 2];
}

export function useTopology() {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchTopology() {
      try {
        const res = await fetch(SEED_URL);
        if (!res.ok) return;
        const data = await res.json();

        if (!active) return;

        const nodes: TopologyNode[] = (data.nodes || []).map((n: Record<string, unknown>) => ({
          id: String(n.address || ""),
          address: String(n.ingress_url || n.url || ""),
          routingAddress: String(n.url || ""),
          publicKey: String(n.sphinx_key || n.public_key || ""),
          layer: Number(n.layer ?? 0),
          role: Number(n.role ?? 1),
        }));

        setTopology({ nodes, fingerprint: String(data.fingerprint || "") });
      } catch {
        // keep existing topology
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchTopology();
    const interval = setInterval(fetchTopology, REFRESH_INTERVAL);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const entryNodes = topology?.nodes.filter((n) => layersForRole(n.role).includes(0)) ?? [];
  const mixNodes = topology?.nodes.filter((n) => layersForRole(n.role).includes(1)) ?? [];
  const exitNodes = topology?.nodes.filter((n) => n.role === 2 || n.role === 3) ?? [];

  return { topology, loading, entryNodes, mixNodes, exitNodes, nodeCount: topology?.nodes.length ?? 0 };
}
