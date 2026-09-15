"use client";
import { useEffect, useRef, useState } from "react";
import {
  Satellite, Cpu, ShieldCheck, Rocket, Users, Target, Trophy, Bell, Megaphone, Coins, ShoppingBag, Gamepad2,
} from "lucide-react";
import { NODES, EDGES, NODE_POS, GREEN, GOLD, beamColor, type Activity, type NodeId } from "@/lib/backstage/graph";
import { t } from "@/lib/i18n";

// EL grafo del sistema (spec paneles §B) — mismo render en desktop y móvil:
// nodos = icono en círculo glass + título debajo; aristas SIEMPRE fluyendo
// (dashes animados, capa base); y HACES de evento reales en SVG (un punto
// brillante que recorre la arista al ocurrir algo). Cero WebGL: funciona igual
// en todas partes y respeta prefers-reduced-motion.
const ICON: Record<NodeId, typeof Cpu> = {
  fuentes: Satellite, agente: Cpu, aprobacion: ShieldCheck, publicado: Rocket,
  usuarios: Users, porras: Target, marcador: Trophy, jugadores: Gamepad2,
  push: Bell, anuncio: Megaphone, monedas: Coins, tienda: ShoppingBag,
};
const GOLDEN: Partial<Record<NodeId, boolean>> = { publicado: true, monedas: true };

const xp = (x: number) => 8 + ((x + 6.5) / 13) * 84;
const yp = (y: number) => 12 + ((3.2 - y) / 6.4) * 76;

type Beam = { id: number; from: NodeId; to: NodeId; color: string; size: number };
let beamSeq = 0;

export function FlowStatic({ pending, clearPending }: {
  pending?: Activity[]; clearPending?: () => void;
}) {
  const [beams, setBeams] = useState<Beam[]>([]);
  const [flash, setFlash] = useState<Partial<Record<NodeId, string>>>({});
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  // eventos reales → haces (y destello del nodo destino al llegar)
  useEffect(() => {
    if (!pending || pending.length === 0) return;
    if (!reduced.current) {
      const spawned: Beam[] = [];
      for (const a of pending) {
        if (!(a.from_node in NODE_POS) || !(a.to_node in NODE_POS)) continue;
        spawned.push({
          id: beamSeq++, from: a.from_node as NodeId, to: a.to_node as NodeId,
          color: beamColor(a.kind),
          size: Math.min(1.1 + Math.log10(Math.max(a.magnitude, 1)) * 0.5, 2.6),
        });
      }
      if (spawned.length) {
        setBeams((b) => [...b, ...spawned].slice(-24));
        for (const s of spawned) {
          setTimeout(() => {
            setFlash((f) => ({ ...f, [s.to]: s.color }));
            setTimeout(() => setFlash((f) => ({ ...f, [s.to]: undefined })), 500);
            setBeams((b) => b.filter((x) => x.id !== s.id));
          }, 1250);
        }
      }
    }
    clearPending?.();
  }, [pending, clearPending]);

  return (
    <div className="relative h-full w-full">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .vk-flow { animation: vkflow 1.1s linear infinite; }
        }
        @keyframes vkflow { to { stroke-dashoffset: -12; } }
      `}</style>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {/* capa base: aristas que fluyen siempre */}
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
        {/* capa de eventos: haces reales (SMIL, sin WebGL) */}
        {beams.map((b) => {
          const [ax, ay] = NODE_POS[b.from], [bx, by] = NODE_POS[b.to];
          return (
            <circle key={b.id} r={b.size} fill={b.color}
              style={{ filter: `drop-shadow(0 0 4px ${b.color})` }}>
              <animateMotion dur="1.2s" fill="freeze" begin="0s"
                path={`M ${xp(ax)} ${yp(ay)} L ${xp(bx)} ${yp(by)}`} />
            </circle>
          );
        })}
      </svg>

      {/* nodos: icono + título */}
      {NODES.map((n: { id: NodeId; x: number; y: number }) => {
        const Icon = ICON[n.id];
        const base = GOLDEN[n.id] ? GOLD : GREEN;
        const c = flash[n.id] ?? base;
        return (
          <div key={n.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
            style={{ left: `${xp(n.x)}%`, top: `${yp(n.y)}%` }}>
            <div className="grid h-12 w-12 place-items-center rounded-full backdrop-blur-md transition-shadow duration-300"
              style={{
                background: "rgba(8,14,11,0.85)", border: `1px solid ${c}`,
                boxShadow: flash[n.id] ? `0 0 26px ${c}` : `0 0 14px ${base}44`,
              }}>
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

export function webglAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}
