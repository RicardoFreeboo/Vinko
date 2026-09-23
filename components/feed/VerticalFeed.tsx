"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PorraSlide } from "./PorraSlide";
import { CommentsSheet } from "./CommentsSheet";
import { FeedAd } from "@/components/ads/FeedAd";
import { PorraCover } from "@/components/PorraCover";
import { ADS_ENABLED } from "@/lib/ads";
import { thumbOf } from "@/lib/thumb";
import { capture } from "@/lib/analytics";
import { loadSocial, toggleLike, makePick, EMPTY_SOCIAL, type Social } from "@/lib/social";
import type { FeedPorra } from "@/lib/feed";
import { t } from "@/lib/i18n";

// FEED VERTICAL a pantalla completa (el de vinko4.apk): una porra por pantalla,
// deslizar arriba/abajo con scroll-snap, vídeo de fondo, carril derecho y pick
// inline. Slide 0 = `intro` (pique del día o tarjeta de login). Un anuncio
// cada 5 porras (nunca el último) solo si ADS_ENABLED. Rendimiento: solo el
// slide actual reproduce; a más de ±1 no se monta ni el <video>.
type Slide =
  | { kind: "intro" }
  | { kind: "porra"; p: FeedPorra; k: number }
  | { kind: "ad"; seed: number };

export function VerticalFeed({ porras, initialPicks, loggedIn, now, intro, isAdmin = false, isAdult = false }: {
  porras: FeedPorra[];
  initialPicks: Record<string, string>;
  loggedIn: boolean;
  now: number;        // reloj del servidor: "cierra en X h" igual en SSR y cliente
  intro: ReactNode;   // primer slide (DailyPick con sesión, login sin ella)
  isAdmin?: boolean;  // (compat) antes gateaba el modo dinero
  isAdult?: boolean;  // +18: ve el teaser del modo dinero ("muy pronto"). Menores no.
}) {
  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [{ kind: "intro" }];
    porras.forEach((p, k) => {
      out.push({ kind: "porra", p, k });
      if (ADS_ENABLED && (k + 1) % 5 === 0 && k < porras.length - 1) out.push({ kind: "ad", seed: Math.floor(k / 5) });
    });
    return out;
  }, [porras]);

  const root = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [picks, setPicks] = useState(initialPicks);
  const [stake, setStake] = useState(10); // Vinkos por pronóstico, compartido entre slides
  const [social, setSocial] = useState<Record<string, Social>>({});
  const [sheet, setSheet] = useState<FeedPorra | null>(null);
  const cargadas = useRef(new Set<string>()); // ids con social pedido (evita repetir)

  // Qué slide está en pantalla (≥60 % visible dentro del contenedor)
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.k));
      }
    }, { root: el, threshold: 0.6 });
    el.querySelectorAll<HTMLElement>("[data-k]").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [slides.length]);

  // Social (likes, comentarios, quién va con qué) se pide al llegar al slide
  const cargar = useCallback(async (p: FeedPorra, force = false) => {
    if (!force && cargadas.current.has(p.id)) return;
    cargadas.current.add(p.id);
    const s = await loadSocial(p.id);
    if (s) setSocial((m) => ({ ...m, [p.id]: s }));
  }, []);
  useEffect(() => {
    const s = slides[current];
    if (s?.kind === "porra") void cargar(s.p);
  }, [current, slides, cargar]);

  // Teclado en escritorio: ↑/↓/PageUp/PageDown pasan de slide
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const d = e.key === "ArrowDown" || e.key === "PageDown" ? 1 : e.key === "ArrowUp" || e.key === "PageUp" ? -1 : 0;
      if (!d || !root.current) return;
      e.preventDefault();
      root.current.scrollBy({ top: d * root.current.clientHeight, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  async function onPick(p: FeedPorra, optionId: string): Promise<string | null> {
    if (!loggedIn) { window.location.href = "/login?next=/feed"; return "no_auth"; }
    const e = await makePick(p.id, optionId, stake);
    if (e) return e;
    capture("pick_made", { is_seed: false });
    setPicks((m) => ({ ...m, [p.id]: optionId }));
    void cargar(p, true); // % por opción con el pick ya dentro
    return null;
  }

  async function onLike(p: FeedPorra) {
    if (!loggedIn) { window.location.href = "/login?next=/feed"; return; }
    // optimista; el servidor confirma el contador
    setSocial((m) => {
      const s = m[p.id] ?? EMPTY_SOCIAL;
      return { ...m, [p.id]: { ...s, liked: !s.liked, likes: Math.max(0, s.likes + (s.liked ? -1 : 1)) } };
    });
    const r = await toggleLike(p.id);
    if (r) setSocial((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? EMPTY_SOCIAL), liked: r.liked, likes: r.count } }));
  }

  const abrirComentarios = useCallback((p: FeedPorra) => { setSheet(p); void cargar(p); }, [cargar]);
  const cerrarComentarios = useCallback(() => setSheet(null), []);

  return (
    <>
      <div ref={root}
        className="mx-auto h-[100dvh] w-full max-w-[430px] snap-y snap-mandatory overflow-y-auto overscroll-y-contain [scrollbar-width:none] md:border-x md:border-[var(--line)] [&::-webkit-scrollbar]:hidden">
        {/* slide 0: pique del día / login, con hueco para el header fijo */}
        <section data-k={0} className="amb relative flex h-[100dvh] w-full snap-start snap-always flex-col gap-4 overflow-y-auto px-5 pb-[calc(96px+env(safe-area-inset-bottom))] pt-20">
          {intro}
          {porras.length === 0 && <p className="text-sm text-[var(--muted)]">{t("home.feedEmpty")}</p>}
          {porras.length > 0 && (
            <div className="mt-auto flex flex-col gap-3 pt-4">
              {/* asomo de la primera porra: tocar = bajar al feed */}
              <button onClick={() => root.current?.scrollBy({ top: root.current.clientHeight, behavior: "smooth" })}
                className="flex items-center gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-2 pr-4 text-left">
                <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-[10px] bg-[var(--ink3)]">
                  {thumbOf(porras[0].video) ? (
                    <img src={thumbOf(porras[0].video)!} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <PorraCover title={porras[0].title} category={porras[0].category} size="sm" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mono block text-[10px] uppercase tracking-[0.14em] text-[var(--win)]">{t("feed.next")}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[14px] font-black leading-tight text-[var(--cream)]">{porras[0].title}</span>
                </span>
                <span aria-hidden className="text-[18px] text-[var(--muted)]">↑</span>
              </button>
              <p className="animate-bounce text-center text-[12px] font-bold text-[var(--muted)]">{t("feed.swipeUp")}</p>
            </div>
          )}
        </section>

        {slides.map((s, i) => {
          if (s.kind === "intro") return null;
          if (s.kind === "ad") {
            return (
              <section key={`ad-${s.seed}`} data-k={i}
                className="amb flex h-[100dvh] w-full snap-start snap-always items-center px-5 pb-[calc(96px+env(safe-area-inset-bottom))] pt-20">
                <div className="w-full"><FeedAd seed={s.seed} /></div>
              </section>
            );
          }
          return (
            <PorraSlide key={s.p.id} p={s.p} index={i} first={s.k === 0}
              isCurrent={i === current} near={Math.abs(i - current) <= 1}
              pick={picks[s.p.id]} stake={stake} onStake={setStake}
              social={social[s.p.id]} loggedIn={loggedIn} now={now} isAdmin={isAdmin} isAdult={isAdult}
              onPick={onPick} onLike={onLike} onComments={abrirComentarios} />
          );
        })}
      </div>

      {sheet && (
        <CommentsSheet p={sheet} social={social[sheet.id]} loggedIn={loggedIn}
          onClose={cerrarComentarios} onSent={() => void cargar(sheet, true)} />
      )}
    </>
  );
}
