import { useState, useEffect } from "react";
import { NOX_SEED_URL } from "@/lib/network";

export interface TopologyNode {
  id: string;
  address: string;
  routingAddress: string;
  publicKey: string;
  layer: number;
  role: number;
  online: boolean;
}

interface Topology {
  nodes: TopologyNode[];
  fingerprint: string;
}

const SEED_URL = `${NOX_SEED_URL.replace(/\/topology$/, "")}/topology`;
const REFRESH_INTERVAL = 60_000;

/**
 * Marks each node online/offline from the seed's liveness list. Snapshots without
 * a liveness list (schema 1) are treated as all-online, matching their meaning.
 */
export function parseTopology(data: Record<string, unknown>): Topology {
  const liveness = Array.isArray(data.liveness)
    ? new Map(
        (data.liveness as Record<string, unknown>[]).map((l) => [
          String(l.address || "").toLowerCase(),
          l.status === "online",
        ]),
      )
    : null;

  const nodes: TopologyNode[] = ((data.nodes || []) as Record<string, unknown>[]).map((n) => {
    const id = String(n.address || "");
    return {
      id,
      address: String(n.ingress_url || n.url || ""),
      routingAddress: String(n.url || ""),
      publicKey: String(n.sphinx_key || n.public_key || ""),
      layer: Number(n.layer ?? 0),
      role: Number(n.role ?? 1),
      online: liveness ? liveness.get(id.toLowerCase()) === true : true,
    };
  });

  return { nodes, fingerprint: String(data.fingerprint || "") };
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
        setTopology(parseTopology(data));
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

  const onlineNodes = topology?.nodes.filter((n) => n.online) ?? [];
  // Columns follow each node's registered primary layer: 0 entry, 1 mix, 2 exit.
  const entryNodes = onlineNodes.filter((n) => n.layer === 0);
  const mixNodes = onlineNodes.filter((n) => n.layer === 1);
  const exitNodes = onlineNodes.filter((n) => n.layer === 2 && (n.role === 2 || n.role === 3));

  return {
    topology,
    loading,
    entryNodes,
    mixNodes,
    exitNodes,
    nodeCount: onlineNodes.length,
    registeredCount: topology?.nodes.length ?? 0,
  };
}
