"use client";
import { NODES, EDGES, NODE_POS, GREEN, type NodeId } from "@/lib/backstage/graph";
import { t } from "@/lib/i18n";

// Fallback estático 2D (spec §7): se usa con prefers-reduced-motion, en móvil o
// si no hay WebGL. Mismo grafo, bonito, sin movimiento — la info no depende del
// haz. Render puro SVG, cero Three.js.
const SX = 100, PADX = 6.5, PADY = 3.2, W = 1300, H = 640, BW = 250, BH = 118;
const px = (x: number) => (x + PADX) * SX;
const py = (y: number) => (PADY - y) * SX;

export function FlowStatic() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="nodeglow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={GREEN} floodOpacity="0.45" />
        </filter>
      </defs>
      {EDGES.map(([a, b], i) => {
        const [ax, ay] = NODE_POS[a], [bx, by] = NODE_POS[b];
        return <line key={i} x1={px(ax)} y1={py(ay)} x2={px(bx)} y2={py(by)}
          stroke={GREEN} strokeOpacity={0.16} strokeWidth={2} />;
      })}
      {NODES.map((n: { id: NodeId; x: number; y: number }) => (
        <g key={n.id}>
          <rect x={px(n.x) - BW / 2} y={py(n.y) - BH / 2} width={BW} height={BH} rx={14}
            filter="url(#nodeglow)"
            fill="rgba(8,14,11,0.9)" stroke={GREEN} strokeOpacity={0.55} strokeWidth={1.5} />
          <text x={px(n.x)} y={py(n.y)} textAnchor="middle" dominantBaseline="central"
            fill="#f4f1e9" fontSize={28} fontWeight={700}
            style={{ fontFamily: "var(--font-mono2), monospace" }}>
            {t(`flujo.node.${n.id}`)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ¿Hay WebGL utilizable? (evita el canvas negro en sandbox/dispositivos viejos)
export function webglAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}
