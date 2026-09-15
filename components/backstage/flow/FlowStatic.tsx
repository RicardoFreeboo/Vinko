"use client";
import {
  Satellite, Cpu, ShieldCheck, Rocket, Users, Target, Trophy, Bell, Megaphone, Coins, ShoppingBag, Gamepad2,
} from "lucide-react";
import { NODES, EDGES, NODE_POS, GREEN, GOLD, type NodeId } from "@/lib/backstage/graph";
import { t } from "@/lib/i18n";

// Grafo estático (spec paneles §B): cada nodo = ICONO en contenedor glass +
// título debajo. Las aristas FLUYEN siempre (dashes animados = capa base viva),
// respetando prefers-reduced-motion. Se usa sin WebGL / móvil / reduced-motion.
const ICON: Record<NodeId, typeof Cpu> = {
  fuentes: Satellite, agente: Cpu, aprobacion: ShieldCheck, publicado: Rocket,
  usuarios: Users, porras: Target, marcador: Trophy, jugadores: Gamepad2,
  push: Bell, anuncio: Megaphone, monedas: Coins, tienda: ShoppingBag,
};
const GOLDEN: Partial<Record<NodeId, boolean>> = { publicado: true, monedas: true };

// mapea coords del grafo (-6.5..6.5, -3.2..3.2) a % del contenedor
const xp = (x: number) => 8 + ((x + 6.5) / 13) * 84;
const yp = (y: number) => 12 + ((3.2 - y) / 6.4) * 76;

export function FlowStatic() {
  return (
    <div className="relative h-full w-full">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .vk-flow { animation: vkflow 1.1s linear infinite; }
        }
        @keyframes vkflow { to { stroke-dashoffset: -12; } }
      `}</style>

      {/* aristas que fluyen (capa base) */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {EDGES.map(([a, b], i) => {
          const [ax, ay] = NODE_POS[a], [bx, by] = NODE_POS[b];
          const gold = GOLDEN[a] && GOLDEN[b];
          const c = gold ? GOLD : GREEN;
          return (
            <g key={i}>
              <line x1={xp(ax)} y1={yp(ay)} x2={xp(bx)} y2={yp(by)}
                stroke={c} strokeOpacity={0.12} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <line className="vk-flow" x1={xp(ax)} y1={yp(ay)} x2={xp(bx)} y2={yp(by)}
                stroke={c} strokeOpacity={0.5} strokeWidth={1.4} strokeDasharray="2 10"
                strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </svg>

      {/* nodos: icono + título debajo */}
      {NODES.map((n: { id: NodeId; x: number; y: number }) => {
        const Icon = ICON[n.id];
        const c = GOLDEN[n.id] ? GOLD : GREEN;
        return (
          <div key={n.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
            style={{ left: `${xp(n.x)}%`, top: `${yp(n.y)}%` }}>
            <div className="grid h-12 w-12 place-items-center rounded-full backdrop-blur-md"
              style={{ background: "rgba(8,14,11,0.85)", border: `1px solid ${c}`, boxShadow: `0 0 14px ${c}44` }}>
              <Icon size={22} color={c} strokeWidth={2} />
            </div>
            <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-[rgba(244,241,233,0.7)]"
              style={{ fontFamily: "var(--font-mono2), monospace" }}>
              {t(`flujo.node.${n.id}`)}
            </span>
          </div>
        );
      })}
    </div>
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
