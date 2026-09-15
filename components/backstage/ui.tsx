// Primitivas del backstage (spec de paneles): glass + neón + mono + grid.
// Solo se usan en /admin. Cero dependencia 3D aquí (el canvas va aparte).
import type { ReactNode } from "react";

// Contenedor con rejilla técnica + scanlines sutiles de fondo.
export function Backstage({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-[#060b09] text-[var(--cream)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(31,224,122,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(31,224,122,0.06) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)" }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function GlassCard({
  children, glow = "win", className = "",
}: {
  children: ReactNode;
  glow?: "win" | "gold" | "none";
  className?: string;
}) {
  const border =
    glow === "gold" ? "rgba(255,194,61,0.35)" : glow === "win" ? "rgba(31,224,122,0.28)" : "rgba(244,241,233,0.1)";
  const shadow =
    glow === "gold" ? "0 0 24px rgba(255,194,61,0.10)" : glow === "win" ? "0 0 24px rgba(31,224,122,0.10)" : "none";
  return (
    <section
      className={`rounded-[16px] p-4 backdrop-blur-md ${className}`}
      style={{ background: "rgba(12,21,18,0.6)", border: `1px solid ${border}`, boxShadow: shadow }}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-[10px] font-bold uppercase tracking-[0.18em] text-[rgba(244,241,233,0.55)]"
      style={{ fontFamily: "var(--font-mono2), monospace" }}
    >
      {children}
    </div>
  );
}

// Número/etiqueta de consola (JetBrains Mono).
export function DataReadout({
  value, label, accent = "var(--win)", size = "md",
}: {
  value: ReactNode;
  label: string;
  accent?: string;
  size?: "md" | "lg";
}) {
  return (
    <div>
      <div
        className={`font-bold leading-none ${size === "lg" ? "text-4xl" : "text-2xl"}`}
        style={{ fontFamily: "var(--font-mono2), monospace", color: accent, textShadow: `0 0 18px ${accent}44` }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] uppercase tracking-wide text-[rgba(244,241,233,0.55)]">{label}</div>
    </div>
  );
}

// KPI grande con Space Grotesk + sparkline emisiva opcional.
export function MetricCard({
  value, label, hint, accent = "var(--win)", spark,
}: {
  value: string;
  label: string;
  hint?: string;
  accent?: string;
  spark?: number[];
}) {
  return (
    <GlassCard glow={accent === "var(--gold)" ? "gold" : "win"}>
      <div className="text-[11px] uppercase tracking-wide text-[rgba(244,241,233,0.55)]">{label}</div>
      <div
        className="mt-2 text-[2.4rem] font-bold leading-none"
        style={{ fontFamily: "var(--font-display), system-ui", color: accent, textShadow: `0 0 22px ${accent}33` }}
      >
        {value}
      </div>
      {spark && spark.length > 1 && <Sparkline data={spark} accent={accent} />}
      {hint && <div className="mt-2 text-[11px] leading-snug text-[rgba(244,241,233,0.45)]">{hint}</div>}
    </GlassCard>
  );
}

function Sparkline({ data, accent }: { data: number[]; accent: string }) {
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-3 h-8 w-full">
      <polyline points={pts} fill="none" stroke={accent} strokeWidth={1.5}
        style={{ filter: `drop-shadow(0 0 4px ${accent})` }} />
    </svg>
  );
}

export function Chip({ children, tone = "win" }: { children: ReactNode; tone?: "win" | "gold" | "red" | "muted" }) {
  const c = tone === "gold" ? "var(--gold)" : tone === "red" ? "var(--red)" : tone === "muted" ? "rgba(244,241,233,0.5)" : "var(--win)";
  return (
    <span
      className="mono rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
      style={{ borderColor: `${c}66`, color: c, fontFamily: "var(--font-mono2), monospace" }}
    >
      {children}
    </span>
  );
}

// Anillo de score (0–100) neón para la cola de aprobación.
export function ScoreRing({ score }: { score: number | null }) {
  const v = score ?? 0;
  const accent = v >= 75 ? "var(--gold)" : v >= 60 ? "var(--win)" : "rgba(244,241,233,0.4)";
  const r = 18, c = 2 * Math.PI * r, off = c * (1 - Math.min(v, 100) / 100);
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(244,241,233,0.12)" strokeWidth="3" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} style={{ filter: `drop-shadow(0 0 4px ${accent})` }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold"
        style={{ fontFamily: "var(--font-mono2), monospace", color: accent }}>
        {score ?? "—"}
      </span>
    </div>
  );
}
