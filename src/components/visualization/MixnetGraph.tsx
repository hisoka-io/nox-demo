import { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { useTopology } from "@/hooks/useTopology";
import type { TopologyNode } from "@/hooks/useTopology";
import { usePacketTracker } from "@/hooks/usePacketTracker";
import { formatLatency } from "@/lib/format";

interface NodePos {
  node: TopologyNode;
  x: number;
  y: number;
  col: number;
}

interface ActivePacket {
  id: number;
  path: NodePos[];
  color: string;
  startTime: number;
  duration: number;
}

const COL_LABELS = ["ENTRY", "MIX", "EXIT"];
const PACKET_DURATION = 1800;
const NODE_RADIUS = 11;

function getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  const isLight = document.documentElement.classList.contains("light");
  return {
    nodeEntry: v("--color-node-entry") || "#B89A7E",
    nodeMix: v("--color-node-mix") || "#7B8B9A",
    nodeExit: v("--color-node-exit") || "#6B9B7B",
    packetFwd: v("--color-packet-forward") || "#B89A7E",
    packetRet: v("--color-packet-return") || "#8BA87E",
    bgSecondary: v("--color-bg-secondary") || "#111111",
    fg: v("--color-fg") || "#E8E5E0",
    isLight,
    // pre-computed opacities for canvas
    gridAlpha: isLight ? 0.08 : 0.04,
    lineAlpha: isLight ? 0.15 : 0.08,
    labelAlpha: isLight ? 0.5 : 0.3,
    nodeLabelAlpha: isLight ? 0.55 : 0.4,
    inactiveRingAlpha: isLight ? 0.5 : 0.35,
  };
}

export function MixnetGraph() {
  const { entryNodes, mixNodes, exitNodes, nodeCount } = useTopology();
  const { events, totalSent, totalReceived, avgLatencyMs } = usePacketTracker();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: 400, h: 600 });
  const activePackets = useRef<ActivePacket[]>([]);
  const lastEventCount = useRef(0);
  const animFrameRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const uniqueEntries = useMemo(() => dedupeById(entryNodes).slice(0, 4), [entryNodes]);
  const uniqueMixes = useMemo(() => dedupeById(mixNodes).slice(0, 7), [mixNodes]);
  const uniqueExits = useMemo(() => dedupeById(exitNodes).slice(0, 3), [exitNodes]);

  const nodePositions = useMemo(() => {
    const { w, h } = dims;
    const padX = 50;
    const padY = 50;
    const cols = [uniqueEntries, uniqueMixes, uniqueExits];
    const positions: NodePos[] = [];

    cols.forEach((colNodes, colIdx) => {
      const x = padX + (colIdx / 2) * (w - 2 * padX);
      const count = colNodes.length || 1;
      colNodes.forEach((node, i) => {
        const y = padY + 20 + ((i + 0.5) / count) * (h - 2 * padY - 40);
        positions.push({ node, x, y, col: colIdx });
      });
    });

    return positions;
  }, [uniqueEntries, uniqueMixes, uniqueExits, dims]);

  const connections = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const e = nodePositions.filter((n) => n.col === 0);
    const m = nodePositions.filter((n) => n.col === 1);
    const x = nodePositions.filter((n) => n.col === 2);
    e.forEach((en) => m.forEach((mn) => lines.push({ x1: en.x, y1: en.y, x2: mn.x, y2: mn.y })));
    m.forEach((mn) => x.forEach((xn) => lines.push({ x1: mn.x, y1: mn.y, x2: xn.x, y2: xn.y })));
    return lines;
  }, [nodePositions]);

  useEffect(() => {
    const newEvents = events.slice(lastEventCount.current);
    lastEventCount.current = events.length;

    const entries = nodePositions.filter((n) => n.col === 0);
    const mixes = nodePositions.filter((n) => n.col === 1);
    const exits = nodePositions.filter((n) => n.col === 2);

    const tc = getThemeColors();

    for (const evt of newEvents) {
      if (evt.type === "error") continue;
      const isOut = evt.type === "outbound";
      const e = pickSeeded(entries, evt.id);
      const m = pickSeeded(mixes, evt.id + 7);
      const x = pickSeeded(exits, evt.id + 13);
      if (!e || !m || !x) continue;

      activePackets.current.push({
        id: evt.id,
        path: isOut ? [e, m, x] : [x, m, e],
        color: isOut ? tc.packetFwd : tc.packetRet,
        startTime: performance.now(),
        duration: PACKET_DURATION,
      });
    }
  }, [events, nodePositions]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tc = getThemeColors();
    const colColors = [tc.nodeEntry, tc.nodeMix, tc.nodeExit];

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dims.w, dims.h);

    // grid dots
    ctx.fillStyle = tc.fg;
    ctx.globalAlpha = tc.gridAlpha;
    for (let gx = 0; gx < dims.w; gx += 30) {
      for (let gy = 0; gy < dims.h; gy += 30) {
        ctx.beginPath();
        ctx.arc(gx, gy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // connections
    ctx.globalAlpha = tc.lineAlpha;
    ctx.lineWidth = 0.8;
    for (const c of connections) {
      // gradient line from source column color to target column color
      const srcNode = nodePositions.find((n) => Math.abs(n.x - c.x1) < 1 && Math.abs(n.y - c.y1) < 1);
      const dstNode = nodePositions.find((n) => Math.abs(n.x - c.x2) < 1 && Math.abs(n.y - c.y2) < 1);
      const srcColor = srcNode ? colColors[srcNode.col] : tc.fg;
      const dstColor = dstNode ? colColors[dstNode.col] : tc.fg;
      const lineGrad = ctx.createLinearGradient(c.x1, c.y1, c.x2, c.y2);
      lineGrad.addColorStop(0, srcColor);
      lineGrad.addColorStop(1, dstColor);
      ctx.strokeStyle = lineGrad;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(c.x2, c.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // column labels
    ctx.font = "600 9px Inter, sans-serif";
    ctx.fillStyle = tc.fg;
    ctx.globalAlpha = tc.labelAlpha;
    ctx.textAlign = "center";
    ctx.letterSpacing = "0.12em";
    for (let i = 0; i < 3; i++) {
      const lx = 50 + (i / 2) * (dims.w - 100);
      ctx.fillText(COL_LABELS[i], lx, 22);
    }
    ctx.globalAlpha = 1;

    const now = performance.now();

    // active packet highlights
    activePackets.current = activePackets.current.filter((p) => now - p.startTime < p.duration);

    for (const pkt of activePackets.current) {
      const t = (now - pkt.startTime) / pkt.duration;
      const segCount = pkt.path.length - 1;
      const segFloat = t * segCount;
      const segIdx = Math.min(Math.floor(segFloat), segCount - 1);
      const segT = segFloat - segIdx;

      const from = pkt.path[segIdx];
      const to = pkt.path[segIdx + 1];
      if (!from || !to) continue;

      const px = from.x + (to.x - from.x) * segT;
      const py = from.y + (to.y - from.y) * segT;

      // trail
      ctx.strokeStyle = pkt.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      const trailT = Math.max(0, segFloat - 0.15);
      const trailSeg = Math.min(Math.floor(trailT), segCount - 1);
      const trailSegT = trailT - trailSeg;
      const tf = pkt.path[trailSeg];
      const tt = pkt.path[Math.min(trailSeg + 1, segCount)];
      if (tf && tt) {
        const tx = tf.x + (tt.x - tf.x) * trailSegT;
        const ty = tf.y + (tt.y - tf.y) * trailSegT;
        ctx.moveTo(tx, ty);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // glow
      const grad = ctx.createRadialGradient(px, py, 0, px, py, 20);
      grad.addColorStop(0, pkt.color + "80");
      grad.addColorStop(1, pkt.color + "00");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, 20, 0, Math.PI * 2);
      ctx.fill();

      // dot
      ctx.fillStyle = pkt.color;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // nodes
    for (const np of nodePositions) {
      const isActive = activePackets.current.some((p) =>
        p.path.some((pp) => pp.node.id === np.node.id),
      );

      const color = colColors[np.col];
      const r = NODE_RADIUS;

      // outer glow when active
      if (isActive) {
        const g = ctx.createRadialGradient(np.x, np.y, r, np.x, np.y, r + 20);
        g.addColorStop(0, color + "50");
        g.addColorStop(1, color + "00");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(np.x, np.y, r + 20, 0, Math.PI * 2);
        ctx.fill();
      }

      // filled circle background
      ctx.fillStyle = tc.bgSecondary;
      ctx.beginPath();
      ctx.arc(np.x, np.y, r, 0, Math.PI * 2);
      ctx.fill();

      // colored ring
      ctx.strokeStyle = color;
      ctx.globalAlpha = isActive ? 1.0 : tc.inactiveRingAlpha;
      ctx.lineWidth = isActive ? 2.5 : 1.8;
      ctx.beginPath();
      ctx.arc(np.x, np.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // inner colored fill (subtle tint)
      ctx.fillStyle = color;
      ctx.globalAlpha = isActive ? 0.25 : 0.08;
      ctx.beginPath();
      ctx.arc(np.x, np.y, r - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // center dot when active
      if (isActive) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(np.x, np.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // label
      ctx.font = "500 8px 'JetBrains Mono', monospace";
      ctx.fillStyle = color;
      ctx.globalAlpha = tc.nodeLabelAlpha;
      ctx.textAlign = "center";
      ctx.fillText(np.node.id.slice(2, 10), np.x, np.y + r + 14);
      ctx.globalAlpha = 1;
    }
  }, [dims, connections, nodePositions]);

  useEffect(() => {
    const loop = () => {
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[500px]">
      <canvas
        ref={canvasRef}
        style={{ width: dims.w, height: dims.h }}
        className="absolute inset-0"
      />
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-fg-muted uppercase tracking-wider">
        <span>{nodeCount} nodes</span>
        <span>{totalSent} sent / {totalReceived} received</span>
        {avgLatencyMs > 0 && <span>avg {formatLatency(avgLatencyMs)}</span>}
      </div>
    </div>
  );
}

function dedupeById(nodes: TopologyNode[]): TopologyNode[] {
  const seen = new Set<string>();
  return nodes.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}

function pickSeeded(arr: NodePos[], seed: number): NodePos | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.abs(seed * 2654435761) % arr.length];
}
