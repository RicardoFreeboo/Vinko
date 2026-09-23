"use client";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// Demo que se juega sola dentro del móvil de la portada, en bucle:
//   0 la porra entra · 1 entra gente y se reparten los votos · 2 "tu pick" ·
//   3 resultado con confeti · → siguiente ejemplo.
// Tres ejemplos para enseñar los tres modos: una ronda, dinero entre amigos y
// Vinkos. Va etiquetada "Ejemplo": es ilustración, no datos ni gente real.
// Se pausa fuera de pantalla o con la pestaña oculta. Movimiento reducido →
// se queda quieta en el resultado del primer ejemplo.

type Scenario = { k: "a" | "b" | "c"; pick: number; pct: number[]; accent: string };

const SCENARIOS: Scenario[] = [
  { k: "a", pick: 2, pct: [24, 29, 47], accent: "var(--gold)" },
  { k: "b", pick: 0, pct: [56, 28, 16], accent: "var(--win)" },
  { k: "c", pick: 1, pct: [34, 53, 13], accent: "var(--gold)" },
];

// Duración de cada fase (ms). La última avanza al siguiente ejemplo.
const PHASE_MS = [850, 1500, 1600, 2900];
const LETTER = ["A", "B", "C"];
const OPT_ACCENT = ["var(--win)", "var(--gold)", "var(--win)"];
const AVATARS: { c: string; l: string }[] = [
  { c: "#1fe07a", l: "J" }, { c: "#ffc23d", l: "M" }, { c: "#8af5bd", l: "R" }, { c: "#ff9f7a", l: "L" },
];

// Confeti determinista (mismo SSR y cliente): 20 piezas en abanico.
const CONFETTI = Array.from({ length: 20 }, (_, i) => {
  const a = (i / 20) * Math.PI * 2;
  const r = 90 + (i % 5) * 22;
  return {
    dx: `${Math.round(Math.cos(a) * r)}px`,
    dy: `${Math.round(Math.sin(a) * r - 40)}px`,
    rot: `${(i * 67) % 360}deg`,
    c: ["#1fe07a", "#ffc23d", "#f4f1e9", "#8af5bd"][i % 4],
    d: `${(i % 4) * 40}ms`,
  };
});

export function PhoneDemo() {
  const [s, setS] = useState(0);
  const [phase, setPhase] = useState(0);
  const [still, setStill] = useState(false);
  const [tick, setTick] = useState(0); // re-arma el temporizador mientras está en pausa
  const rootRef = useRef<HTMLDivElement>(null);
  const visible = useRef(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      setPhase(3);
      return;
    }
    const el = rootRef.current;
    let io: IntersectionObserver | undefined;
    if (el && "IntersectionObserver" in window) {
      io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; }, { threshold: 0.1 });
      io.observe(el);
    }
    return () => io?.disconnect();
  }, []);

  useEffect(() => {
    if (still) return;
    const id = window.setTimeout(() => {
      // pausa: fuera de pantalla o pestaña oculta → reintenta sin avanzar
      if (!visible.current || document.hidden) { setTick((n) => n + 1); return; }
      if (phase < 3) setPhase(phase + 1);
      else { setPhase(0); setS((n) => (n + 1) % SCENARIOS.length); }
    }, PHASE_MS[phase]);
    return () => window.clearTimeout(id);
  }, [phase, still, tick]);

  const sc = SCENARIOS[s];
  const q = t(`landing.demo.${sc.k}.q`);
  const opts = [0, 1, 2].map((i) => t(`landing.demo.${sc.k}.o${i}`));
  const joined = phase >= 1 ? AVATARS.length : 0;
  const secsLeft = Math.max(1, 3 - phase);

  return (
    <div ref={rootRef} className="flex h-full flex-col px-3.5 pb-3 pt-11">
      {/* barra superior de la app */}
      <div className="flex items-center justify-between px-1">
        <Logo mark={20} word={15} />
        <span className="mono rounded-full border border-[var(--win)]/50 px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.14em] text-[var(--win)]">
          {t("landing.demo.tag")}
        </span>
      </div>

      {/* tarjeta de porra: se re-monta en cada ejemplo para repetir la entrada 3D */}
      <div key={s} className="lx-demo-card relative mt-4 flex flex-col gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-3.5 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between">
          <span
            className="rounded-full px-2.5 py-1 text-[10.5px] font-black"
            style={{ background: "rgba(255,194,61,0.12)", color: "var(--gold)", border: "1px solid rgba(255,194,61,0.35)" }}
          >
            {t(`landing.demo.${sc.k}.stake`)}
          </span>
        </div>

        <p className="text-[17px] font-black leading-[1.15] tracking-tight text-[var(--cream)]">{q}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {AVATARS.slice(0, joined).map((a, i) => (
              <span key={a.l} className="lx-avatar" style={{ background: a.c, animationDelay: `${i * 110}ms` }}>
                {a.l}
              </span>
            ))}
            {joined > 0 && (
              <span className="mono ml-2 whitespace-nowrap text-[10px] font-bold text-[var(--muted)]">
                {t("landing.demo.in", { n: String(joined + 1) })}
              </span>
            )}
          </div>
          <span className="mono whitespace-nowrap text-[9.5px] uppercase tracking-[0.1em] text-[var(--muted)]">
            {phase >= 3 ? t("landing.demo.resolved") : t("landing.demo.closes", { t: `0:0${secsLeft}` })}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {opts.map((label, i) => {
            const accent = OPT_ACCENT[i];
            const picked = phase >= 2 && i === sc.pick;
            const win = phase >= 3 && i === sc.pick;
            return (
              <div
                key={i}
                className="lx-opt flex items-center gap-2.5 rounded-[13px] border bg-[var(--ink)] px-2.5 py-2.5"
                data-picked={picked ? "1" : "0"}
                data-win={win ? "1" : "0"}
                style={{ borderColor: picked ? accent : "var(--line)" }}
              >
                <span className="lx-opt-bar" style={{ width: phase >= 1 ? `${sc.pct[i]}%` : "0%", background: accent }} />
                <span
                  className="mono relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black"
                  style={{ color: accent, border: `2px solid ${accent}` }}
                >
                  {LETTER[i]}
                </span>
                <span className="relative flex-1 truncate text-[13px] font-bold text-[var(--cream)]">{label}</span>
                {picked && !win && (
                  <span className="mono relative text-[8.5px] font-black uppercase tracking-[0.1em]" style={{ color: accent }}>
                    {t("landing.demo.mine")}
                  </span>
                )}
                {win && <span className="relative text-[13px] font-black" style={{ color: "var(--win)" }}>✓</span>}
                {phase >= 1 && (
                  <span className="mono relative w-8 text-right text-[10.5px] font-bold text-[var(--muted)]">{sc.pct[i]}%</span>
                )}
                {phase === 2 && i === sc.pick && !still && (
                  <>
                    <span className="lx-tap" />
                    <span className="lx-finger" aria-hidden>👆</span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* barra de progreso del ciclo */}
        {!still && (
          <div className="lx-progress" aria-hidden>
            <b key={`${s}-${phase}`} style={{ animationDuration: `${PHASE_MS[phase]}ms` }} />
          </div>
        )}

        {phase >= 3 && !still && (
          <div className="lx-confetti" aria-hidden>
            {CONFETTI.map((c, i) => (
              <i
                key={i}
                style={{
                  background: c.c,
                  animationDelay: c.d,
                  ["--dx" as string]: c.dx,
                  ["--dy" as string]: c.dy,
                  ["--rot" as string]: c.rot,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* resultado */}
      <div className="mt-3 min-h-[58px]">
        {phase >= 3 && (
          <div
            className="lx-result flex items-center gap-2.5 rounded-[16px] px-3.5 py-3 text-[12.5px] font-black leading-snug text-[var(--ink)]"
            style={{ background: `linear-gradient(135deg, var(--win), ${sc.accent})`, boxShadow: "0 14px 30px -12px rgba(31,224,122,0.7)" }}
          >
            {t(`landing.demo.${sc.k}.result`)}
          </div>
        )}
      </div>

      {/* navegación de la app */}
      <div className="mt-auto flex justify-around border-t border-[var(--line)] pt-2.5 text-[8.5px] font-bold uppercase tracking-wide text-[var(--muted)]">
        <span className="text-[var(--win)]">{t("nav.feed")}</span>
        <span>{t("nav.perfil")}</span>
        <span className="grid h-6 w-6 -translate-y-1 place-items-center rounded-full bg-[var(--win)] text-[14px] text-[var(--ink)]">＋</span>
        <span>{t("nav.grupos")}</span>
        <span>{t("nav.liga")}</span>
      </div>
    </div>
  );
}
