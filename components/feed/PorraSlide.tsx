"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { FastVideo } from "@/components/FastVideo";
import { PorraCover } from "@/components/PorraCover";
import { StakePicker } from "@/components/StakePicker";
import { ShareWhatsApp } from "@/components/ShareWhatsApp";
import { VinkoCoin } from "@/components/VinkoCoin";
import { optionLetter, optionAccent } from "@/components/vote/VoteOption";
import { VMark } from "@/components/Logo";
import { Avatar } from "./Avatar";
import { thumbOf } from "@/lib/thumb";
import { porraUrl } from "@/lib/share";
import { coverTheme } from "@/lib/cover";
import { whenLabel } from "@/lib/when";
import { porcentajes, pickErrorKey, type Social } from "@/lib/social";
import type { FeedPorra } from "@/lib/feed";
import { t } from "@/lib/i18n";

// DESCUBRIR (VINKO_PANTALLAS 05): UNA predicción a pantalla completa. Vídeo
// (o portada temática) de fondo; arriba a la derecha el carril (creador · me
// gusta · comentarios · Enviar); abajo los chips (tema y cuándo cierra), la
// pregunta en grande, quién ya votó (gente real de porra_social, nunca
// inventada), las opciones A/B y «Pones 🪙 10 · cambiar». El pick se hace aquí.
// Hueco inferior = altura del AppNav (+ botón Crear elevado) + safe-area.
// Solo-puntos: el pick es siempre con Vinkos.
const PB = "pb-[calc(86px+env(safe-area-inset-bottom))]";

// 1.240 → «1,2 k» (como el diseño); por debajo de mil, tal cual.
function compact(n: number): string {
  if (n < 1000) return String(n);
  return `${(Math.round(n / 100) / 10).toLocaleString("es-CO")} k`;
}

function RailBtn({ icon, label, onClick, aria, on = false }: {
  icon: ReactNode; label: string; onClick: () => void; aria: string; on?: boolean;
}) {
  return (
    <button onClick={onClick} aria-label={aria} aria-pressed={on}
      className="flex flex-col items-center gap-1 text-white">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45 text-[24px] leading-none shadow-[0_2px_10px_rgba(0,0,0,0.4)] backdrop-blur-sm">{icon}</span>
      <span className="mono h-4 text-[12px] font-bold leading-4 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{label}</span>
    </button>
  );
}

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "win" | "gold" }) {
  const style = tone === "win"
    ? { background: "var(--win)", color: "var(--ink)", borderColor: "var(--win)" }
    : tone === "gold"
      ? { background: "var(--gold)", color: "var(--ink)", borderColor: "var(--gold)" }
      : { background: "rgba(8,12,12,0.55)", color: "var(--cream)", borderColor: "rgba(255,255,255,0.16)" };
  return (
    <span className="mono flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-bold uppercase tracking-[0.1em] backdrop-blur-sm" style={style}>
      {children}
    </span>
  );
}

// «@caro y 1.240 más ya votaron» con sus caras. Solo gente real (FTC): sin
// social cargado todavía, no se pinta nada.
function Voters({ social }: { social: Social | undefined }) {
  if (!social) return <div className="h-7" aria-hidden />;
  const n = social.picks.length;
  if (n === 0) return <p className="text-[15px] text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{t("descubrir.first")}</p>;
  const who = `@${social.picks[0].handle}`;
  const [pre, post] = (n === 1
    ? t("descubrir.votedOne", { who: "\u0000" })
    : t("descubrir.voted", { who: "\u0000", n: (n - 1).toLocaleString("es-CO") })).split("\u0000");
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex -space-x-2">
        {social.picks.slice(0, 3).map((x, i) => (
          <span key={i} className="rounded-full ring-2 ring-[var(--ink)]">
            <Avatar handle={x.handle} url={x.avatar} size={26} />
          </span>
        ))}
      </span>
      <p className="min-w-0 truncate text-[15px] text-white/85 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
        {pre}<b className="font-black text-white">{who}</b>{post}
      </p>
    </div>
  );
}

export function PorraSlide({ p, index, first, last, isCurrent, near, pick, stake, onStake, social, loggedIn, now, tz, onPick, onLike, onComments }: {
  p: FeedPorra;
  index: number;        // posición del slide en el feed (data-k)
  first: boolean;       // primera predicción: arranca desde el HTML (eager)
  last: boolean;        // última: sin «Desliza para la siguiente»
  isCurrent: boolean;   // solo este reproduce vídeo
  near: boolean;        // ±1 del actual: monta el <video>; más lejos, solo la portada
  pick: string | undefined;
  stake: number;
  onStake: (v: number) => void;
  social: Social | undefined;
  loggedIn: boolean;
  now: number;          // reloj del servidor: misma etiqueta en SSR y al hidratar
  tz: string;           // zona del usuario para «Cierra dom 9:00 p. m.»
  onPick: (p: FeedPorra, optionId: string) => Promise<string | null>;
  onLike: (p: FeedPorra) => void;
  onComments: (p: FeedPorra) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editStake, setEditStake] = useState(false);

  async function tap(optionId: string) {
    if (busy) return;
    if (pick) return;
    setBusy(true); setErr(null);
    const e = await onPick(p, optionId);
    setBusy(false);
    if (e && e !== "no_auth") setErr(t(pickErrorKey(e)));
  }

  const cover = <PorraCover title={p.title} category={p.category} size="lg" />;
  const pct = pick ? porcentajes(social, p.options) : null;
  const handle = p.creator?.handle ?? null;
  const theme = coverTheme(p.category, p.title);
  const closed = new Date(p.closes_at).getTime() <= now;

  return (
    <section data-k={index} className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-[var(--ink)]">
      {/* fondo: vídeo (solo cerca del actual) o portada temática */}
      {p.video && near ? (
        <FastVideo src={p.video} poster={thumbOf(p.video) ?? undefined} active={isCurrent} eager={first} fallback={cover} />
      ) : (
        // sin vídeo: la portada un poco más arriba y más grande, para que el
        // emoji no caiga justo bajo la pregunta y las opciones
        <div className="absolute inset-0 -translate-y-[10%] scale-[1.2]">{cover}</div>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-black/95 via-black/70 to-transparent" />

      <div className={`absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 px-[18px] ${PB}`}>
        {/* CARRIL DERECHO */}
        <div className="flex flex-col items-center gap-3.5 self-end">
          {p.official || !handle ? (
            <span aria-label={t("p.badgeOfficial")} className="grid h-12 w-12 place-items-center rounded-full bg-[var(--ink2)] ring-2 ring-[var(--win)]">
              <VMark size={28} />
            </span>
          ) : (
            <Link href={`/u/${handle}`} aria-label={`@${handle}`}>
              <Avatar handle={handle} url={p.creator?.avatar_url ?? null} size={48} ring />
            </Link>
          )}
          <RailBtn icon={social?.liked ? "❤️" : "🤍"} label={social ? compact(social.likes) : ""} on={!!social?.liked}
            aria={t("feed.like")} onClick={() => onLike(p)} />
          <RailBtn icon="💬" label={social ? compact(social.comments.length) : ""}
            aria={t("social.comments")} onClick={() => onComments(p)} />
          <ShareWhatsApp porraId={p.id} text={t("nueva.shareText", { title: p.title, url: porraUrl(p.slug) })}
            className="flex flex-col items-center gap-1 text-white">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--win)] text-[22px] leading-none shadow-[0_4px_16px_-4px_rgba(31,224,122,0.7)]">📲</span>
            <span className="mono h-4 text-[11.5px] font-bold uppercase leading-4 tracking-[0.06em] [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{t("descubrir.send")}</span>
          </ShareWhatsApp>
        </div>

        {/* chips: tema y cuándo cierra (en TU zona) */}
        <div className="flex flex-wrap gap-2">
          {p.official && <Chip tone="win">{t("p.badgeOfficial")}</Chip>}
          {p.featured && <Chip tone="gold">{t("home.featured")}</Chip>}
          <Chip><span aria-hidden className="text-[14px] leading-none">{theme.emoji}</span>{t(`descubrir.cat.${theme.key}`)}</Chip>
          <Chip>
            <Clock size={14} strokeWidth={2.4} aria-hidden />
            {closed ? t("descubrir.closed") : t("descubrir.closes", { when: whenLabel(p.closes_at, tz, new Date(now)) })}
          </Chip>
        </div>

        <h2 className="text-[32px] font-black leading-[1.04] tracking-[-0.03em] text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.85)] [text-wrap:balance]">{p.title}</h2>

        <Voters social={social} />

        {loggedIn && !pick && editStake && <StakePicker value={stake} onChange={(v) => { onStake(v); setEditStake(false); }} />}

        <div className={p.options.length === 2 ? "grid grid-cols-2 gap-2.5" : "flex flex-col gap-2"}>
          {p.options.map((o) => {
            const chosen = pick === o.id;
            const n = pick ? (pct ? pct[o.idx] ?? 0 : null) : null;
            return (
              <button key={o.id} onClick={() => tap(o.id)} disabled={busy || !!pick || closed}
                className="relative flex h-[58px] items-center gap-2.5 overflow-hidden rounded-[16px] border-[1.5px] px-3.5 text-left text-[17px] font-black text-white backdrop-blur-sm transition-colors disabled:opacity-100"
                style={{
                  borderColor: chosen ? "var(--win)" : "rgba(255,255,255,0.28)",
                  background: chosen ? "rgba(31,224,122,0.22)" : "rgba(8,12,12,0.55)",
                }}>
                {/* barra de % tras el pick */}
                {n !== null && (
                  <span aria-hidden className="absolute inset-y-0 left-0 transition-[width] duration-500"
                    style={{ width: `${n}%`, background: chosen ? "rgba(31,224,122,0.28)" : "rgba(255,255,255,0.14)" }} />
                )}
                <span className="relative grid h-[30px] w-[30px] flex-none place-items-center rounded-full border-2 font-black"
                  style={{ borderColor: optionAccent(o.idx), color: optionAccent(o.idx), fontFamily: "var(--mono)", fontSize: 13 }}>
                  {optionLetter(o.idx)}
                </span>
                <span className="relative min-w-0 flex-1 truncate">{o.label}</span>
                {n !== null && <span className="mono relative text-[13px] font-black">{n}%</span>}
                {chosen && <span className="relative text-[var(--win)]">✓</span>}
              </button>
            );
          })}
        </div>

        {/* «Pones 🪙 10 · cambiar» y la pista para pasar a la siguiente */}
        {!pick && (
          <div className="flex items-center justify-between gap-3 text-[14px] text-white/75 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
            {loggedIn ? (
              <span className="flex items-center gap-1.5">
                {t("pick.stake")} <VinkoCoin size={18} /> <b className="mono text-[15px] font-black text-white">{stake}</b> ·
                <button type="button" onClick={() => setEditStake((v) => !v)} className="underline decoration-dotted underline-offset-2">
                  {t("descubrir.change")}
                </button>
              </span>
            ) : (
              <span className="font-bold text-white/85">{t("feed.loginToPlay")}</span>
            )}
            {!last && <span className="shrink-0">↑ {t("descubrir.swipe")}</span>}
          </div>
        )}
        {pick && !err && <p className="text-center text-[13px] font-bold text-[var(--win)] [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{t("stories.done")}</p>}
        {err && <p className="text-center text-[13px] font-bold text-[var(--red)] [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{err}</p>}
      </div>
    </section>
  );
}
