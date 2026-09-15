"use client";
import { useEffect, useRef, useState } from "react";
import { VMark } from "@/components/Logo";
import { FastVideo } from "@/components/FastVideo";
import { VinkoCoin } from "@/components/VinkoCoin";
import type { FeedPorra } from "@/lib/feed";
import { t } from "@/lib/i18n";

// Visor de HISTORIAS a pantalla completa (como apk4): un vídeo por porra, la
// pregunta y las opciones ENCIMA, y apuestas ahí mismo. Se DESLIZA en horizontal
// (izquierda/derecha), no arriba/abajo. Cerrar con la X o deslizando abajo.
export function StoriesViewer({
  porras, start, picks, loggedIn, onClose, onPick,
}: {
  porras: FeedPorra[];
  start: number;
  picks: Record<string, string>;
  loggedIn: boolean;
  onClose: () => void;
  onPick: (porraId: string, optionId: string) => Promise<string | null>;
}) {
  const [i, setI] = useState(start);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);

  const p = porras[i];
  const myPick = p ? picks[p.id] : undefined;

  useEffect(() => { setErr(null); }, [i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, porras.length - 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, porras.length]);

  function down(e: React.PointerEvent) { drag.current = { x: e.clientX, y: e.clientY }; }
  function move(e: React.PointerEvent) {
    if (!drag.current) return;
    setDx(e.clientX - drag.current.x);
  }
  function up(e: React.PointerEvent) {
    if (!drag.current) return;
    const ddx = e.clientX - drag.current.x, ddy = e.clientY - drag.current.y;
    drag.current = null; setDx(0);
    if (Math.abs(ddy) > 120 && Math.abs(ddy) > Math.abs(ddx)) { onClose(); return; }
    if (ddx < -60) setI((v) => Math.min(v + 1, porras.length - 1));
    else if (ddx > 60) setI((v) => Math.max(v - 1, 0));
  }

  async function pick(optionId: string) {
    if (!p || busy || myPick) return;
    if (!loggedIn) { window.location.href = `/login?next=/hoy`; return; }
    setBusy(true); setErr(null);
    const e = await onPick(p.id, optionId);
    setBusy(false);
    if (e) setErr(e.includes("NO_POINTS") ? t("pick.noPoints") : t("pick.err"));
  }

  if (!p) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <div className="relative mx-auto h-full w-full max-w-[500px] overflow-hidden"
        style={{ transform: `translateX(${dx * 0.4}px)`, transition: dx ? "none" : "transform .25s" }}>
        {/* fondo: vídeo o placeholder */}
        {p.video ? (
          <FastVideo key={p.slug} src={p.video} speed={1.5} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--ink)]"><VMark size={64} /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/90" />

        {/* barras de progreso arriba */}
        <div className="absolute inset-x-3 top-3 flex gap-1">
          {porras.map((_, k) => (
            <span key={k} className="h-1 flex-1 rounded-full" style={{ background: k <= i ? "var(--win)" : "rgba(255,255,255,0.3)" }} />
          ))}
        </div>
        <button onClick={onClose} aria-label="Cerrar"
          className="absolute right-3 top-6 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-xl text-white backdrop-blur">✕</button>
        {p.official && (
          <span className="mono absolute left-3 top-7 rounded-full bg-[var(--win)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ink)]">{t("p.badgeOfficial")}</span>
        )}

        {/* flechas laterales (desktop) */}
        {i > 0 && <button onClick={() => setI(i - 1)} className="absolute left-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/30 p-2 text-2xl text-white sm:block">‹</button>}
        {i < porras.length - 1 && <button onClick={() => setI(i + 1)} className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/30 p-2 text-2xl text-white sm:block">›</button>}

        {/* pregunta + opciones ENCIMA */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 pb-8">
          <h2 className="text-2xl font-black leading-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.8)]">{p.title}</h2>
          <div className="flex flex-col gap-2">
            {p.options.map((o) => {
              const chosen = myPick === o.id;
              return (
                <button key={o.id} onClick={() => pick(o.id)} disabled={busy || !!myPick}
                  className="flex items-center justify-between rounded-[14px] border-2 px-4 py-3.5 text-left text-[16px] font-bold backdrop-blur-md transition-colors"
                  style={{
                    borderColor: chosen ? "var(--win)" : "rgba(255,255,255,0.35)",
                    background: chosen ? "rgba(31,224,122,0.22)" : "rgba(0,0,0,0.35)",
                    color: "white",
                  }}>
                  {o.label}
                  {chosen ? <span className="text-[var(--win)]">✓</span>
                    : <span className="mono flex items-center gap-1 text-[13px] text-[var(--gold)]"><VinkoCoin size={15} />10</span>}
                </button>
              );
            })}
          </div>
          {myPick && <p className="text-center text-sm font-bold text-[var(--win)]">{t("stories.done")}</p>}
          {err && <p className="text-center text-sm text-[var(--red)]">{err}</p>}
          {!myPick && !err && <p className="text-center text-[11px] text-white/60">{t("stories.swipe")}</p>}
        </div>
      </div>
    </div>
  );
}
