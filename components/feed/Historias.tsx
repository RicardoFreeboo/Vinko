"use client";
import { useState } from "react";
import { StoriesViewer } from "./StoriesViewer";
import { PorraCover } from "@/components/PorraCover";
import { thumbOf } from "@/lib/thumb";
import { makePick } from "@/lib/social";
import { capture } from "@/lib/analytics";
import type { FeedPorra } from "@/lib/feed";
import { t } from "@/lib/i18n";

// HISTORIAS (recuperadas 24-sep-2026 a petición de Ricardo): carril HORIZONTAL de
// porras con vídeo (formato 9:16 estilo apk4) que abre el visor a pantalla
// completa con swipe izquierda/derecha (StoriesViewer). Distinto del feed
// vertical: es la experiencia "stories" de Instagram. El pick reutiliza makePick
// (lib/social), el mismo que usa VerticalFeed → no toca el loop. Sin sesión: al
// tocar una opción, redirige a /login (igual que el feed). Solo porras con vídeo.
export function Historias({ porras, initialPicks, loggedIn }: {
  porras: FeedPorra[];
  initialPicks: Record<string, string>;
  loggedIn: boolean;
}) {
  const withVideo = porras.filter((p) => p.video).slice(0, 12);
  const [picks, setPicks] = useState(initialPicks);
  const [stake, setStake] = useState(10);
  const [open, setOpen] = useState<number | null>(null);

  if (withVideo.length === 0) return null;

  async function onPick(porraId: string, optionId: string): Promise<string | null> {
    if (!loggedIn) { window.location.href = "/login?next=/feed"; return "no_auth"; }
    const e = await makePick(porraId, optionId, stake);
    if (e) return e;
    capture("pick_made", { is_seed: false });
    setPicks((m) => ({ ...m, [porraId]: optionId }));
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-black text-[var(--cream)]">{t("home.stories")}</h2>
      <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {withVideo.map((p, k) => {
          const thumb = thumbOf(p.video);
          return (
            <button key={p.id} type="button" onClick={() => setOpen(k)}
              aria-label={p.title}
              className="relative aspect-[9/16] w-[132px] shrink-0 snap-start overflow-hidden rounded-[16px] border border-[var(--line)] text-left">
              {thumb ? (
                <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0"><PorraCover title={p.title} category={p.category} size="sm" /></div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />
              {p.official && (
                <span className="mono absolute left-2 top-2 rounded-full bg-[var(--win)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--ink)]">
                  {t("p.badgeOfficial")}
                </span>
              )}
              {picks[p.id] && (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[var(--win)] text-[11px] font-black text-[var(--ink)]">✓</span>
              )}
              <div className="absolute inset-x-0 bottom-0 p-2.5">
                <p className="line-clamp-3 text-[12px] font-black leading-tight text-white">{p.title}</p>
              </div>
            </button>
          );
        })}
      </div>

      {open !== null && (
        <StoriesViewer porras={withVideo} start={open} picks={picks} loggedIn={loggedIn}
          stake={stake} onStake={setStake} onClose={() => setOpen(null)} onPick={onPick} />
      )}
    </section>
  );
}
