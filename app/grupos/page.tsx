import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bell, Check, Clock, Crown, Plus, Search, X } from "lucide-react";
import { getMemberSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchMe } from "@/lib/me";
import { clockLeft, leftLabel, whenLabel } from "@/lib/when";
import { GruposClient } from "@/components/GruposClient";
import { QuickVote } from "@/components/home/QuickVote";
import { Avatar, avatarColor } from "@/components/feed/Avatar";
import { VinkoCoin } from "@/components/VinkoCoin";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("grupos.title"), robots: { index: false, follow: false } };

// INICIO · tus grupos (VINKO_PANTALLAS 04). Una llamada (home_groups, 0077):
// tus grupos con tu puesto de la semana, lo que falta por votar en ellos (se
// vota aquí mismo), tus votos esperando resultado y tus últimos resultados.
// Abajo, crear un grupo o entrar con código.
//
// ?join=<código>: enlace/QR de invitación. Con sesión entra al grupo (RPC
// join_group, idempotente) y salta a /g/[id]; sin sesión, el login vuelve aquí
// con el mismo código.
const CODE_RX = /^[a-z0-9]{4,32}$/i;

type HomeGroup = {
  id: string; name: string; members: number; rank: number | null; week: number;
  leader: string | null; leader_avatar: string | null; leader_week: number;
  above: string | null; gap: number | null; below: string | null; lead: number | null;
};
type Face = { handle: string; avatar_url: string | null; name: string };
type ToVote = {
  id: string; slug: string; title: string; closes_at: string; group: string;
  options: { id: string; idx: number; label: string }[]; voters: number; faces: Face[];
};
type Waiting = { slug: string; title: string; closes_at: string; group: string | null; mine: string; same: number; total: number };
type Resolved = { slug: string; title: string; won: boolean; winner: string | null; winners: number; total: number; punteria: number };
type Home = { week_ends: string; stake: number; unread: number; groups: HomeGroup[]; to_vote: ToVote[]; waiting: Waiting[]; resolved: Resolved[] };

const EMPTY: Home = { week_ends: "", stake: 10, unread: 0, groups: [], to_vote: [], waiting: [], resolved: [] };

export default async function Grupos({ searchParams }: { searchParams: Promise<{ join?: string }> }) {
  const { join } = await searchParams;
  const code = typeof join === "string" && CODE_RX.test(join) ? join.toLowerCase() : null;
  const session = await getMemberSession();
  if (!session) {
    const next = code ? `/grupos?join=${code}` : "/grupos";
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("grupos.login")}</p>
        <Link href={`/login?next=${encodeURIComponent(next)}`}
          className="rounded-full bg-[var(--win)] px-6 py-3 text-[15px] font-black text-[var(--ink)]"
          style={{ boxShadow: "0 5px 0 var(--windeep)" }}>
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  let joinErr = false;
  if (code && sb) {
    const { data, error } = await sb.rpc("join_group", { p_code: code });
    if (!error && typeof data === "string") redirect(`/g/${data}`);
    joinErr = true;
  }

  const [homeRes, me] = sb ? await Promise.all([sb.rpc("home_groups"), fetchMe(sb)]) : [null, null];
  const home: Home = { ...EMPTY, ...((homeRes && !homeRes.error ? homeRes.data : null) as Partial<Home> | null) };
  const tz = me?.tz ?? "America/Bogota";
  const streak = me?.streak_days ?? 0;

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col pb-28">
      <header className="flex h-[60px] items-center justify-between px-[18px]">
        <Logo mark={26} word={20} />
        <div className="flex items-center gap-2.5">
          <Link href="/saldo" aria-label={t("home.streak", { n: String(streak) })}
            className="flex h-8 items-center gap-1 rounded-full border border-[rgba(255,194,61,0.5)] bg-[rgba(0,0,0,0.35)] px-[11px] text-[15px] font-black text-[var(--gold)]">
            🔥 {streak}
          </Link>
          <IconLink href="/buscar" label={t("home.search")}><Search size={18} /></IconLink>
          <IconLink href="/buzon" label={t("home.inbox")}>
            <Bell size={18} />
            {home.unread > 0 && (
              <i className="absolute -right-[3px] -top-[3px] h-[18px] min-w-[18px] rounded-[9px] bg-[var(--win)] px-1 text-center text-[11px] font-bold not-italic leading-[18px] text-[var(--ink)]">
                {home.unread > 9 ? "9+" : home.unread}
              </i>
            )}
          </IconLink>
        </div>
      </header>

      {joinErr && <p className="px-[18px] text-center text-xs text-[var(--red)]">{t("grupos.joinFail")}</p>}

      {/* tus grupos: tu puesto de la semana */}
      {home.groups.length > 0 ? (
        <div className="flex snap-x scroll-px-[18px] gap-2.5 overflow-x-auto px-[18px] pb-0.5 pt-1 [scrollbar-width:none]">
          {home.groups.map((g, i) => <GroupCard key={g.id} g={g} wide={i === 0} weekEnds={home.week_ends} />)}
          <a href="#nuevo-grupo" aria-label={t("home.newGroup")}
            className="grid min-w-[80px] snap-start place-items-center rounded-[20px] border border-dashed border-[var(--line2)] text-[var(--muted)]">
            <Plus size={22} />
          </a>
        </div>
      ) : (
        <section className="mx-[18px] mt-1 rounded-[20px] border border-[rgba(31,224,122,0.35)] bg-[var(--ink2)] p-[15px]">
          <p className="text-[18px] font-black text-[var(--cream)]">{t("home.emptyGroups")}</p>
          <p className="mt-1 text-[13.5px] leading-snug text-[var(--muted)]">{t("home.emptyGroupsSub")}</p>
          <a href="#nuevo-grupo" className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-full bg-[var(--win)] px-5 text-[15px] font-black text-[var(--ink)]"
            style={{ boxShadow: "0 4px 0 var(--windeep)" }}>
            <Plus size={18} strokeWidth={2.6} /> {t("home.newGroup")}
          </a>
        </section>
      )}

      {/* por votar */}
      <SectionHead title={t("home.toVote")} right={home.to_vote.length > 0 ? String(home.to_vote.length) : undefined} />
      <div className="flex flex-col gap-2.5 px-[18px]">
        {home.to_vote.length === 0 ? (
          <Link href="/nueva" className="rounded-[20px] border border-dashed border-[var(--line2)] p-[15px] text-center text-[14px] text-[var(--muted)]">
            {t("home.emptyVote")} <b className="text-[var(--win)]">{t("home.create")} →</b>
          </Link>
        ) : home.to_vote.map((p) => (
          <article key={p.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-[15px]">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              <span className="truncate text-[var(--muted)]">{p.group}</span>
              <span className="flex-1" />
              <span className="flex shrink-0 items-center gap-1.5 text-[var(--muted)]"><Clock size={14} aria-hidden />{whenLabel(p.closes_at, tz)}</span>
            </div>
            <Link href={`/p/${p.slug}`} className="mt-2 block text-[20px] font-black leading-[1.15] tracking-[-0.03em] text-[var(--cream)]">
              {p.title}
            </Link>
            <QuickVote porraId={p.id} slug={p.slug} options={p.options ?? []} stake={home.stake} />
            <div className="mt-[11px] flex items-center gap-2 text-[13px]">
              {p.faces.length > 0 && (
                <span className="flex">
                  {p.faces.map((f, i) => (
                    <span key={f.handle} className={i ? "-ml-2" : ""} style={{ borderRadius: 999, boxShadow: "0 0 0 2.5px var(--ink2)" }}>
                      <Avatar handle={f.handle} url={f.avatar_url} size={22} />
                    </span>
                  ))}
                </span>
              )}
              <span className="truncate text-[var(--muted)]">
                {p.voters === 0 ? t("home.first")
                  : p.voters === 1 ? t("home.oneVoted", { name: p.faces[0]?.name ?? "" })
                  : t("home.voted", { n: String(p.voters) })}
              </span>
              <span className="flex-1" />
              <span className="flex shrink-0 items-center gap-1.5 text-[var(--muted)]">
                {t("home.stake")} <VinkoCoin size={15} /> <b className="mono text-[var(--cream)]">{home.stake}</b>
              </span>
            </div>
          </article>
        ))}
      </div>

      {/* esperando resultado */}
      {home.waiting.length > 0 && (
        <>
          <SectionHead title={t("home.waiting")} right={String(home.waiting.length)} />
          <div className="flex flex-col gap-2.5 px-[18px]">
            {home.waiting.map((w) => {
              const clock = clockLeft(w.closes_at);
              const long = clock !== null && Number(clock.split(":")[0]) >= 24;
              return (
                <Link key={w.slug} href={`/p/${w.slug}`}
                  className="flex items-center gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-[15px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[var(--muted)]">{w.group ?? t("home.public")}</div>
                    <div className="mt-1 truncate text-[16px] font-bold text-[var(--cream)]">{w.title}</div>
                    <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--cream)]">
                      <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-[3px] bg-[var(--win)]" />
                      <span className="shrink-0">{t("home.you")}</span> <b className="truncate">{w.mine}</b>
                      <span className="shrink-0 text-[var(--muted2)]">· {t("home.like", { n: String(w.same), total: String(w.total) })}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {clock === null ? (
                      <div className="max-w-[90px] text-[12px] leading-tight text-[var(--muted)]">{t("home.pending")}</div>
                    ) : long ? (
                      <>
                        <div className="mono text-[17px] font-bold text-[var(--cream)]">{leftLabel(w.closes_at)}</div>
                        <div className="text-[12px] text-[var(--muted)]">{t("home.toKnowLong")}</div>
                      </>
                    ) : (
                      <>
                        <div className="mono text-[20px] font-bold text-[var(--cream)]">{clock}</div>
                        <div className="text-[12px] text-[var(--muted)]">{t("home.toKnow")}</div>
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* resueltas */}
      {home.resolved.length > 0 && (
        <>
          <SectionHead title={t("home.resolved")} right={t("home.seeAll")} href="/perfil" />
          <div className="flex flex-col gap-2.5 px-[18px]">
            {home.resolved.map((r) => {
              const few = r.total > 0 && r.winners * 2 <= r.total;
              return (
                <Link key={r.slug} href={`/p/${r.slug}`}
                  className="flex items-center gap-3 rounded-[20px] border bg-[var(--ink2)] p-[15px]"
                  style={{ borderColor: r.won ? "rgba(31,224,122,0.35)" : "var(--line)" }}>
                  <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-[14px]"
                    style={{ background: r.won ? "rgba(31,224,122,0.12)" : "rgba(255,107,107,0.10)" }}>
                    {r.won ? <Check size={24} strokeWidth={3} className="text-[var(--win)]" /> : <X size={22} strokeWidth={3} className="text-[var(--red)]" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-bold leading-tight text-[var(--cream)]">
                      {r.won ? t("home.wonTitle", { winner: r.winner ?? "" }) : t("home.lostTitle", { winner: r.winner ?? "" })}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{r.title}</div>
                    <div className="mt-0.5 text-[13px] text-[var(--muted)]">
                      {t(few ? "home.sawOnly" : "home.saw", { n: String(r.winners), total: String(r.total) })}
                      {r.won && r.punteria > 0 && <> · <span className="font-bold text-[var(--win)]">{t("home.punteria", { n: String(r.punteria) })}</span></>}
                    </div>
                  </div>
                  <span className="mono shrink-0 rounded-full border border-[var(--line)] bg-[var(--ink3)] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--cream)]">
                    {t("home.receipt")}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* crear grupo / entrar con código */}
      <div className="mt-6">
        <GruposClient />
      </div>

      <AppNav />
    </main>
  );
}

function IconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link href={href} aria-label={label}
      className="relative grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--ink2)] text-[var(--cream)]">
      {children}
    </Link>
  );
}

function SectionHead({ title, right, href }: { title: string; right?: string; href?: string }) {
  return (
    <div className="mx-[18px] mb-2.5 mt-[22px] flex items-baseline justify-between">
      <h2 className="text-[18px] font-bold tracking-[-0.01em] text-[var(--cream)]">{title}</h2>
      {right && (href
        ? <Link href={href} className="text-[13px] text-[var(--muted)]">{right}</Link>
        : <span className="text-[13px] text-[var(--muted)]">{right}</span>)}
    </div>
  );
}

// Tarjeta de grupo: tu puesto de la semana, a cuánto estás del de arriba, lo
// que queda de semana y quién lidera. La primera, ancha y con borde verde.
function GroupCard({ g, wide, weekEnds }: { g: HomeGroup; wide: boolean; weekEnds: string }) {
  const scored = g.leader_week > 0;
  const iLead = scored && g.rank === 1;
  const line = !scored ? t("home.noScore")
    : g.above && g.gap ? null
    : iLead && g.below && g.lead ? t("home.ahead", { n: String(g.lead), who: `@${g.below}` })
    : t("home.alone");
  return (
    <Link href={`/g/${g.id}`}
      className={`flex snap-start flex-col rounded-[20px] border bg-[var(--ink2)] p-[14px] ${wide ? "min-w-[236px]" : "min-w-[168px]"}`}
      style={{ borderColor: wide ? "rgba(31,224,122,0.35)" : "var(--line)" }}>
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-[7px] text-[12px] font-black text-[var(--cream)]"
          style={{ background: avatarColor(g.name) }}>
          {g.name.slice(0, 1).toUpperCase()}
        </span>
        <b className="truncate text-[16px] text-[var(--cream)]">{g.name}</b>
      </div>
      {/* ancha: puesto y texto en fila; estrecha: el texto debajo (como el diseño) */}
      <div className={`mt-2.5 flex gap-2 ${wide ? "items-center" : "flex-col"}`}>
        <span className="text-[30px] font-black leading-none tracking-[-0.03em] text-[var(--cream)]">
          {scored && g.rank ? `${g.rank}.º` : "—"}
        </span>
        <span className="min-w-0 text-[13px] leading-tight text-[var(--muted)]">
          {line ?? <>{t("home.gapPre")} <b className="text-[var(--cream)]">{t("home.pts", { n: String(g.gap) })}</b> {t("home.gapPost", { who: `@${g.above}` })}</>}
          {weekEnds && <><br />{t("home.left", { left: leftLabel(weekEnds) })}</>}
        </span>
      </div>
      {wide && (
        <div className="mt-2.5 flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--cream)]">
          {scored && g.leader ? (
            iLead ? (
              <><Crown size={15} aria-hidden className="text-[var(--gold)]" /><span className="font-bold text-[var(--gold)]">{t("home.youLead")}</span></>
            ) : (
              <>
                <Crown size={15} aria-hidden className="text-[var(--gold)]" />
                <span className="font-bold text-[var(--gold)]">{t("home.leads")}</span>
                <Avatar handle={g.leader} url={g.leader_avatar} size={20} />
                <span className="truncate">@{g.leader}</span>
              </>
            )
          ) : (
            <span className="text-[var(--muted)]">{t("home.members", { n: String(g.members) })}</span>
          )}
        </div>
      )}
    </Link>
  );
}
