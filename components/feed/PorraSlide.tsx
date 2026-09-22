"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FastVideo } from "@/components/FastVideo";
import { PorraCover } from "@/components/PorraCover";
import { StakePicker } from "@/components/StakePicker";
import { ShareWhatsApp } from "@/components/ShareWhatsApp";
import { VinkoCoin } from "@/components/VinkoCoin";
import { VMark } from "@/components/Logo";
import { Avatar } from "./Avatar";
import { thumbOf } from "@/lib/thumb";
import { porraUrl } from "@/lib/share";
import { porcentajes, pickErrorKey, type Social } from "@/lib/social";
import type { FeedPorra } from "@/lib/feed";
import { t } from "@/lib/i18n";

// UNA porra a pantalla completa (como el feed de vinko4.apk): vídeo de fondo,
// carril derecho (creador · me gusta · comentarios · compartir) y la pregunta
// con sus opciones encima, abajo, donde se hace el pick sin salir del feed.
// Hueco inferior = altura del AppNav (+ botón Crear elevado) + safe-area.
const PB = "pb-[calc(86px+env(safe-area-inset-bottom))]";

const eur = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

function fmtFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));
}
// "Cierra en 5 h" con `now` del SERVIDOR (misma cifra en SSR y al hidratar).
function cierra(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return t("feed.closed");
  const min = Math.round(ms / 60000);
  if (min < 60) return t("feed.closesMin", { n: String(Math.max(1, min)) });
  const h = Math.round(ms / 3600000);
  if (h < 48) return t("feed.closesH", { n: String(h) });
  const d = Math.round(ms / 86400000);
  if (d <= 14) return t("feed.closesD", { n: String(d) });
  return t("home.closes", { date: fmtFecha(iso) });
}

function RailBtn({ icon, label, onClick, aria, on = false }: {
  icon: ReactNode; label: string; onClick: () => void; aria: string; on?: boolean;
}) {
  return (
    <button onClick={onClick} aria-label={aria} aria-pressed={on}
      className="flex flex-col items-center gap-1 text-white">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-[22px] leading-none shadow-[0_2px_10px_rgba(0,0,0,0.4)]">{icon}</span>
      <span className="mono h-4 text-[11px] font-bold leading-4 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{label}</span>
    </button>
  );
}

export function PorraSlide({ p, index, first, isCurrent, near, pick, stake, onStake, social, loggedIn, now, onPick, onLike, onComments, isAdmin = false }: {
  p: FeedPorra;
  index: number;        // posición del slide en el feed (data-k)
  first: boolean;       // primera porra: arranca desde el HTML (eager)
  isCurrent: boolean;   // solo este reproduce vídeo
  near: boolean;        // ±1 del actual: monta el <video>; más lejos, solo la portada
  pick: string | undefined;
  stake: number;
  onStake: (v: number) => void;
  social: Social | undefined;
  loggedIn: boolean;
  now: number;
  onPick: (p: FeedPorra, optionId: string) => Promise<string | null>;
  onLike: (p: FeedPorra) => void;
  onComments: (p: FeedPorra) => void;
  isAdmin?: boolean;    // demo del modo dinero en el pick (solo admin, maqueta)
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Modo dinero: maqueta solo-admin. No hace pick real; muestra el pick en euros
  // con etiqueta «Próximamente». Se enciende de verdad con partner/licencia.
  const [money, setMoney] = useState(false);
  const [eurCents, setEurCents] = useState(500);
  const [moneyPick, setMoneyPick] = useState<string | null>(null);

  async function tap(optionId: string) {
    if (busy) return;
    if (money) { setMoneyPick(optionId); return; } // maqueta, sin pick real
    if (pick) return;
    setBusy(true); setErr(null);
    const e = await onPick(p, optionId);
    setBusy(false);
    if (e && e !== "no_auth") setErr(t(pickErrorKey(e)));
  }

  const cover = <PorraCover title={p.title} category={p.category} size="lg" />;
  const pct = pick ? porcentajes(social, p.options) : null;
  const jugando = social?.picks.length ?? 0;
  const handle = p.creator?.handle ?? null;

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
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/75 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-black/95 via-black/65 to-transparent" />

      {/* chip arriba a la izquierda: Vinko oficial o @creador */}
      <div className="absolute left-4 top-[68px] z-10">
        {p.official ? (
          <span className="mono rounded-full bg-[var(--win)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--ink)]">{t("p.badgeOfficial")}</span>
        ) : handle ? (
          <Link href={`/u/${handle}`} className="flex items-center gap-1.5 rounded-full bg-black/45 py-1 pl-1 pr-3 text-[12px] font-bold text-white">
            <Avatar handle={handle} url={p.creator?.avatar_url ?? null} size={22} />@{handle}
          </Link>
        ) : null}
        {p.featured && (
          <span className="mono ml-1.5 rounded-full bg-[var(--gold)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--ink)]">{t("home.featured")}</span>
        )}
      </div>

      {/* bloque inferior: pregunta + carril + opciones */}
      <div className={`absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 px-4 ${PB}`}>
        <div className="flex items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="text-2xl font-black leading-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.85)] [text-wrap:balance]">{p.title}</h2>
            <p className="mono text-[11px] uppercase tracking-[0.1em] text-white/75 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
              {cierra(p.closes_at, now)}{jugando > 0 && ` · ${t("feed.playing", { n: String(jugando) })}`}
            </p>
          </div>

          {/* CARRIL DERECHO */}
          <div className="flex shrink-0 flex-col items-center gap-3.5 pb-1">
            {p.official || !handle ? (
              <span aria-label={t("p.badgeOfficial")} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--ink2)] ring-2 ring-[var(--win)]">
                <VMark size={26} />
              </span>
            ) : (
              <Link href={`/u/${handle}`} aria-label={`@${handle}`}>
                <Avatar handle={handle} url={p.creator?.avatar_url ?? null} size={44} ring />
              </Link>
            )}
            <RailBtn icon={social?.liked ? "❤️" : "🤍"} label={social ? String(social.likes) : ""} on={!!social?.liked}
              aria={t("feed.like")} onClick={() => onLike(p)} />
            <RailBtn icon="💬" label={social ? String(social.comments.length) : ""}
              aria={t("social.comments")} onClick={() => onComments(p)} />
            <ShareWhatsApp porraId={p.id} text={t("nueva.shareText", { title: p.title, url: porraUrl(p.slug) })}
              className="flex flex-col items-center gap-1 text-white">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#25D366] text-[22px] leading-none shadow-[0_2px_10px_rgba(0,0,0,0.4)]">📲</span>
              <span className="mono h-4 text-[11px] font-bold leading-4 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{t("feed.share")}</span>
            </ShareWhatsApp>
          </div>
        </div>

        {/* Toggle Puntos/Dinero — SOLO admin, maqueta del modo dinero (como el modo $ de la APK) */}
        {isAdmin && loggedIn && !pick && (
          <div className="flex w-max items-center gap-1 rounded-full border border-white/20 bg-black/45 p-1 backdrop-blur">
            <button type="button" onClick={() => { setMoney(false); setMoneyPick(null); }}
              className={`rounded-full px-3 py-1 text-[12px] font-black ${!money ? "bg-[var(--win)] text-[var(--ink)]" : "text-white/70"}`}>🪙 {t("pick.modePoints")}</button>
            <button type="button" onClick={() => setMoney(true)}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-black ${money ? "bg-[var(--gold)] text-[var(--ink)]" : "text-white/70"}`}>
              💶 {t("pick.modeMoney")}
              <span className="rounded-full bg-black/25 px-1 text-[8px] font-bold uppercase tracking-wide">{t("pick.soon")}</span>
            </button>
          </div>
        )}

        {!pick && (loggedIn
          ? (money
              ? (
                <div className="flex items-center gap-2 rounded-[10px] border border-[var(--gold)]/50 bg-black/50 px-3 py-2 backdrop-blur">
                  <span className="text-[14px] font-bold text-[var(--gold)]">€</span>
                  <input type="number" inputMode="decimal" min={1} max={500} value={eurCents / 100}
                    onChange={(e) => setEurCents(Math.max(100, Math.min(50000, Math.round(Number(e.target.value) * 100))))}
                    aria-label={t("pick.modeMoney")}
                    className="w-full bg-transparent text-[15px] font-black text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                  <span className="mono text-[10px] text-white/60">{t("pick.soon")}</span>
                </div>
              )
              : <StakePicker value={stake} onChange={onStake} />)
          : <p className="text-[12px] font-bold text-white/80">{t("feed.loginToPlay")}</p>)}

        <div className="flex flex-col gap-2">
          {p.options.map((o) => {
            const chosen = money ? moneyPick === o.id : pick === o.id;
            const n = !money && pick ? (pct ? pct[o.idx] ?? 0 : null) : null;
            return (
              <button key={o.id} onClick={() => tap(o.id)} disabled={busy || (!money && !!pick)}
                className="relative flex items-center justify-between overflow-hidden rounded-[14px] border-2 px-4 py-3.5 text-left text-[16px] font-bold text-white transition-colors disabled:opacity-100"
                style={{
                  borderColor: chosen ? (money ? "var(--gold)" : "var(--win)") : "rgba(255,255,255,0.35)",
                  background: chosen ? (money ? "rgba(255,209,102,0.18)" : "rgba(31,224,122,0.22)") : "rgba(0,0,0,0.45)",
                }}>
                {/* barra de % tras el pick (solo en puntos) */}
                {n !== null && (
                  <span aria-hidden className="absolute inset-y-0 left-0 transition-[width] duration-500"
                    style={{ width: `${n}%`, background: chosen ? "rgba(31,224,122,0.28)" : "rgba(255,255,255,0.14)" }} />
                )}
                <span className="relative">{o.label}</span>
                <span className="relative flex items-center gap-1.5">
                  {n !== null && <span className="mono text-[13px] font-black">{n}%</span>}
                  {chosen ? <span className={money ? "text-[var(--gold)]" : "text-[var(--win)]"}>✓</span>
                    : money ? <span className="mono text-[13px] font-black text-[var(--gold)]">{eur(eurCents)}</span>
                    : !pick && <span className="mono flex items-center gap-1 text-[13px] text-[var(--gold)]"><VinkoCoin size={15} />{stake}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {money && moneyPick && <p className="text-center text-[13px] font-bold text-[var(--gold)] [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{t("pick.moneyMock", { amount: eur(eurCents) })}</p>}
        {!money && pick && !err && <p className="text-center text-[13px] font-bold text-[var(--win)] [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{t("stories.done")}</p>}
        {err && <p className="text-center text-[13px] font-bold text-[var(--red)] [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{err}</p>}
      </div>
    </section>
  );
}
