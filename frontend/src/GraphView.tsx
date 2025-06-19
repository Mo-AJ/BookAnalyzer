import { useRef, useEffect, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { ForceGraphMethods, NodeObject, LinkObject } from "react-force-graph-2d";
import * as d3 from "d3-force";

/* ─── Types coming from backend ─────────────────────────────────────────── */
type Character = { name: string; mentions: number };
type Interaction = { from: string; to: string; count: number; strength: number };

interface Props {
  characters: Character[];
  interactions: Interaction[];
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */
const edgeColour = (s: number) =>
  s > 0
    ? "rgba(34,197,94,0.9)"   // green-500
    : s < 0
    ? "rgba(239,68,68,0.9)"   // red-500
    : "rgba(107,114,128,0.6)"; // gray-500

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function GraphView({ characters, interactions }: Props) {
  const fgRef = useRef<ForceGraphMethods<NodeObject, LinkObject>>(undefined);
  const tipRef = useRef<HTMLDivElement>(null);

  /* top-20 characters only */
  const { nodes, links } = useMemo(() => {
    const top = [...characters]
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 20);

    const allow = new Set(top.map((c) => c.name));

    const ns: NodeObject[] = top.map((c) => ({
      id: c.name,
      val: 14 + Math.log1p(c.mentions) * 6, // base radius 14px; gentle scaling
    }));

    const ls: LinkObject[] = interactions
      .filter((i) => allow.has(i.from) && allow.has(i.to))
      .map((i) => ({
        source: i.from,
        target: i.to,
        count: i.count,
        strength: i.strength,
      }));

    return { nodes: ns, links: ls };
  }, [characters, interactions]);

  /* zoom / collision / forces – run once */
  useEffect(() => {
    if (!fgRef.current) return;

    fgRef.current
      .d3Force("charge", d3.forceManyBody().strength(-200))
      .d3Force("link")?.distance(180);

    /* keep nodes from overlapping so links don't cross through */
    fgRef.current.d3Force(
      "collision",
      d3.forceCollide().radius((n: any) => n.val + 20)
    );
  }, []);

  /* tooltip follow-mouse */
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (tipRef.current) {
        tipRef.current.style.left = e.clientX + 12 + "px";
        tipRef.current.style.top = e.clientY + 12 + "px";
      }
    };
    addEventListener("mousemove", move);
    return () => removeEventListener("mousemove", move);
  }, []);

  /* ─────────────────────────────────────────────────────────────────────── */
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 500,
        border: "1px solid #52525b", // zinc-600
        overflow: "hidden",
        borderRadius: "8px",
        backgroundColor: "#ffffff", // white background for graph
      }}
    >
      <ForceGraph2D
        ref={fgRef}
        graphData={{ nodes, links }}
        linkCurvature={0.25}
        linkWidth={(l) => 3 + Math.log1p((l as any).count)}
        linkColor={(l) => edgeColour((l as any).strength)}
        enableNodeDrag={false}
        cooldownTicks={60}
        onEngineStop={() => fgRef.current?.zoomToFit(450, 120)}
        nodeCanvasObject={(node, ctx) => {
          const r = (node as any).val as number;
          const label = String(node.id);

          /* draw circle */
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#111";
          ctx.stroke();

          /* label – single font size (no shrink) */
          ctx.font = "12px Inter, sans-serif";
          ctx.fillStyle = "#111";
          const w = ctx.measureText(label).width;
          ctx.fillText(label, node.x! - w / 2, node.y! + 4);
        }}
        onLinkHover={(link) => {
          if (!tipRef.current) return;
          if (link) {
            const s =
              typeof link.source === "object"
                ? (link.source as any).id
                : link.source;
            const t =
              typeof link.target === "object"
                ? (link.target as any).id
                : link.target;
            const { count, strength } = link as any;
            tipRef.current.textContent = `${s} ↔ ${t} — ${count} interactions, ${strength} strength`;
            tipRef.current.style.display = "block";
          } else {
            tipRef.current.style.display = "none";
          }
        }}
        onNodeHover={(node) => {
          if (!tipRef.current) return;
          if (node) {
            const character = characters.find(c => c.name === node.id);
            const mentions = character?.mentions || 0;
            tipRef.current.textContent = `${node.id} — ${mentions} mentions`;
            tipRef.current.style.display = "block";
          } else {
            tipRef.current.style.display = "none";
          }
        }}
      />

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(24, 24, 27, 0.95)", // dark zinc-900
          border: "1px solid rgb(63, 63, 70)", // zinc-700
          borderRadius: 6,
          padding: "12px 16px",
          fontSize: 12,
          fontFamily: "Inter, sans-serif",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8, color: "#ffffff" }}>
          Graph Legend
        </div>
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: "#ffffff" }}>●</span> Nodes: Characters (size = mentions)
        </div>
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: "rgba(34,197,94,0.9)" }}>━━</span> Positive interactions
        </div>
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: "rgba(239,68,68,0.9)" }}>━━</span> Negative interactions
        </div>
        <div style={{ marginBottom: 0 }}>
          <span style={{ color: "rgba(107,114,128,0.6)" }}>━━</span> Neutral interactions
        </div>
      </div>

      {/* tooltip element */}
      <div
        ref={tipRef}
        style={{
          position: "fixed",
          background: "rgba(24, 24, 27, 0.95)", // dark zinc-900
          color: "#ffffff",
          padding: "4px 8px",
          fontSize: 12,
          borderRadius: 4,
          pointerEvents: "none",
          display: "none",
          zIndex: 1000,
          border: "1px solid rgb(63, 63, 70)", // zinc-700
        }}
      />
    </div>
  );
}
