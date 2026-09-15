"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { StoriesViewer } from "./StoriesViewer";
import { FastVideo } from "@/components/FastVideo";
import { FeedAd } from "@/components/ads/FeedAd";
import { VinkoCoin } from "@/components/VinkoCoin";
import { StakePicker } from "@/components/StakePicker";
import { VMark } from "@/components/Logo";
import { capture } from "@/lib/analytics";
import type { FeedPorra } from "@/lib/feed";
import { t } from "@/lib/i18n";

// Feed del jugador: HISTORIAS horizontales (abren el visor a pantalla completa)
// + tarjetas donde apuestas SIN abrir (tap en la opción). Estética apk4.
function fmtCloses(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));
}

export function FeedClient({ porras, initialPicks, loggedIn }: {
  porras: FeedPorra[]; initialPicks: Record<string, string>; loggedIn: boolean;
}) {
  const [picks, setPicks] = useState(initialPicks);
  const [viewer, setViewer] = useState<number | null>(null);
  // Arrastrar las historias con el ratón en escritorio: overflow-x-auto solo
  // responde al dedo/rueda, no a click-y-arrastrar.
  const [stake, setStake] = useState(10); // Vinkos que se ponen por pronóstico
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const moved = useRef(false);
  function railDown(e: React.PointerEvent) {
    const el = rail.current; if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft };
    moved.current = false;
  }
  function railMove(e: React.PointerEvent) {
    const el = rail.current, d = drag.current;
    if (!el || !d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) moved.current = true;
    el.scrollLeft = d.left - dx;
  }
  function railUp() { drag.current = null; }
  const stories = porras.filter((p) => p.video);

  async function onPick(porraId: string, optionId: string): Promise<string | null> {
    if (!loggedIn) { window.location.href = "/login?next=/feed"; return "no_auth"; }
    const sb = supabaseBrowser();
    if (!sb) return "no_backend";
    const { error } = await sb.rpc("make_pick", { p_porra: porraId, p_option: optionId, p_stake: stake });
    if (error) return error.message;
    capture("pick_made", { is_seed: false });
    setPicks((m) => ({ ...m, [porraId]: optionId }));
    return null;
  }

  return (
    <>
      {/* HISTORIAS — carrusel horizontal, abren el visor */}
      {stories.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-black text-[var(--cream)]">{t("home.stories")}</h2>
          <div ref={rail} onPointerDown={railDown} onPointerMove={railMove}
            onPointerUp={railUp} onPointerLeave={railUp}
            className="-mx-5 flex cursor-grab snap-x snap-mandatory select-none gap-3 overflow-x-auto px-5 pb-1 active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {stories.map((p, k) => (
              <button key={p.id} onClick={() => { if (moved.current) return; setViewer(porras.indexOf(p)); }}
                className="relative aspect-[9/16] w-[124px] shrink-0 snap-start overflow-hidden rounded-[16px] border-2"
                style={{ borderColor: picks[p.id] ? "var(--win)" : "var(--gold)" }}>
                <FastVideo src={p.video!} className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/25" />
                <div className="absolute inset-x-0 bottom-0 p-2">
                  <p className="line-clamp-3 text-left text-[11px] font-black leading-tight text-white">{p.title}</p>
                </div>
                {picks[p.id] && <span className="absolute right-1.5 top-1.5 text-[var(--win)]">✓</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* FEED — apuesta sin abrir */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-black text-[var(--cream)]">{t("home.feed")}</h2>
          <span className="mono text-[11px] text-[var(--muted)]">{porras.length}</span>
        </div>
        {porras.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t("home.feedEmpty")}</p>
        ) : (
          porras.flatMap((p, k) => {
            const card = (
              <FeedCard key={p.id} p={p} pick={picks[p.id]} onOpen={() => setViewer(k)} onPick={onPick} loggedIn={loggedIn} />
            );
            // 1 anuncio cada 5 tarjetas, nunca el último (§ FeedAdAdapter)
            return (k + 1) % 5 === 0 && k < porras.length - 1
              ? [card, <FeedAd key={`ad-${k}`} seed={Math.floor(k / 5)} />]
              : [card];
          })
        )}
      </section>

      {viewer !== null && (
        <StoriesViewer porras={porras} start={viewer} picks={picks} loggedIn={loggedIn} stake={stake} onStake={setStake}
          onClose={() => setViewer(null)} onPick={onPick} />
      )}
    </>
  );

  function FeedCard({ p, pick, onOpen, onPick, loggedIn }: {
    p: FeedPorra; pick?: string; onOpen: () => void; onPick: (a: string, b: string) => Promise<string | null>; loggedIn: boolean;
  }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    async function tap(optionId: string) {
      if (busy || pick) return;
      setBusy(true); setErr(null);
      const e = await onPick(p.id, optionId);
      setBusy(false);
      if (e && e !== "no_auth") setErr(e.includes("NO_POINTS") ? t("pick.noPoints") : t("pick.err"));
    }
    return (
      <div className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--ink2)]">
        <button onClick={onOpen} className="relative block aspect-[16/10] w-full bg-[var(--ink3)]">
          {p.video ? (
            <FastVideo src={p.video} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2"><VMark size={32} /><span className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">{t("p.aiMaking")}</span></div>
          )}
          {p.official && <span className="mono absolute left-3 top-3 rounded-full bg-[var(--win)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ink)]">{t("p.badgeOfficial")}</span>}
          <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold uppercase text-white backdrop-blur">▶ {t("home.open")}</span>
        </button>
        <div className="flex flex-col gap-2.5 p-4">
          <h3 className="text-[16px] font-black leading-tight text-[var(--cream)] [text-wrap:balance]">{p.title}</h3>
          {!pick && <StakePicker value={stake} onChange={setStake} />}
          <div className="flex flex-col gap-1.5">
            {p.options.map((o) => {
              const chosen = pick === o.id;
              return (
                <button key={o.id} onClick={() => tap(o.id)} disabled={busy || !!pick}
                  className="flex items-center justify-between rounded-[12px] border px-3.5 py-2.5 text-left text-[14px] font-bold text-[var(--cream)] transition-colors"
                  style={{ borderColor: chosen ? "var(--win)" : "var(--line)", background: chosen ? "rgba(31,224,122,0.12)" : "transparent" }}>
                  {o.label}
                  {chosen ? <span className="text-[var(--win)]">✓</span>
                    : <span className="mono flex items-center gap-1 text-[12px] text-[var(--gold)]"><VinkoCoin size={14} />{stake}</span>}
                </button>
              );
            })}
          </div>
          {err && <p className="text-xs text-[var(--red)]">{err}</p>}
          <div className="flex items-center justify-between">
            <span className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">{t("home.closes", { date: fmtCloses(p.closes_at) })}</span>
            <Link href={`/p/${p.slug}`} className="text-[12px] font-black text-[var(--win)]">{t("home.share")}</Link>
          </div>
        </div>
      </div>
    );
  }
}
