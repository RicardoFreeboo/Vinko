import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { getFeed } from "@/lib/feed";
import { HoyClient } from "@/components/HoyClient";
import { FeedClient } from "@/components/feed/FeedClient";
import { VinkoCoin } from "@/components/VinkoCoin";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

// HOME del jugador. Siempre con contenido (feed público de porras con vídeo),
// botón de crear bien visible, y si hay sesión: Monedas/Nivel/Puntería/Racha +
// el pique del día. Un inversor lo abre y ve la app llena, no una pregunta.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("hoy.title"), robots: { index: false, follow: false } };

function madridDay(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}

export default async function Hoy() {
  const [session, feed] = await Promise.all([getSession(), getFeed()]);
  const sb = await supabaseServer();
  const today = madridDay(), yesterday = madridDay(-1);

  type Profile = {
    points: number; xp: number; marcador_total: number; streak_days: number; streak_best: number;
    streak_shields: number; daily_bonus_last: string | null; daily_bonus_step: number;
  };
  let profile: Profile | null = null;
  let daily: { id: string; question: string; options: string[]; status: string; correct_idx: number | null } | null = null;
  let myAnswer: number | null = null;
  let prev: { question: string; options: string[]; correct_idx: number | null;
    answer: { option_idx: number; correct: boolean | null; pts: number; score: number } | null } | null = null;
  let unread = 0;

  if (session && sb) {
    const [{ data: p }, { data: d }, { data: pv }, { count: unreadCount }] = await Promise.all([
      sb.from("profiles").select("points, xp, marcador_total, streak_days, streak_best, streak_shields, daily_bonus_last, daily_bonus_step").eq("id", session.id).maybeSingle(),
      sb.from("daily_picks").select("*").eq("scheduled_for", today).eq("lang", "es").in("status", ["open", "resolved"]).maybeSingle(),
      sb.from("daily_picks").select("*").eq("scheduled_for", yesterday).eq("lang", "es").eq("status", "resolved").maybeSingle(),
      sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", session.id).is("read_at", null),
    ]);
    profile = (p as Profile | null) ?? null;
    unread = unreadCount ?? 0;
    if (d) {
      daily = { id: d.id, question: d.question, options: d.options as string[], status: d.status, correct_idx: d.correct_idx };
      const { data: a } = await sb.from("daily_pick_answers").select("option_idx").eq("day_id", d.id).eq("user_id", session.id).maybeSingle();
      myAnswer = a?.option_idx ?? null;
    }
    if (pv) {
      const { data: a } = await sb.from("daily_pick_answers").select("option_idx, correct, pts, score").eq("day_id", pv.id).eq("user_id", session.id).maybeSingle();
      prev = { question: pv.question, options: pv.options as string[], correct_idx: pv.correct_idx, answer: a ?? null };
    }
  }

  // picks del usuario sobre el feed → para marcar lo ya apostado
  const feedPicks: Record<string, string> = {};
  if (session && sb && feed.length) {
    const { data } = await sb.from("picks").select("porra_id, option_id").eq("user_id", session.id).in("porra_id", feed.map((f) => f.id));
    for (const pk of data ?? []) feedPicks[pk.porra_id] = pk.option_id;
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-28 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <div className="flex items-center gap-2.5">
          {/* RACHA arriba, como en la primera versión */}
          {profile && (
            <span className="flex items-center gap-1 rounded-full border border-[var(--gold)]/50 bg-[var(--gold)]/10 px-2.5 py-1 text-[13px] font-black text-[var(--gold)]">
              🔥 {profile.streak_days}
            </span>
          )}
          {session ? (
            <>
              <Link href={`/u/${session.handle}`} className="mono text-xs text-[var(--muted)]">@{session.handle}</Link>
              {/* BUSCAR perfiles — estilo Instagram */}
              <Link href="/buscar" aria-label={t("home.search")}
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--ink2)] text-[16px] leading-none">
                🔍
              </Link>
              {/* NOTIFICACIONES — campana en la esquina, estilo app */}
              <Link href="/buzon" aria-label={t("home.notifications")}
                className="relative grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--ink2)] text-[17px] leading-none">
                🔔
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--red)] px-1 text-[9px] font-black text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </>
          ) : (
            <Link href="/login?next=/hoy" className="rounded-full bg-[var(--win)] px-3.5 py-1.5 text-[12px] font-black text-[var(--ink)]">
              {t("home.loginCta")}
            </Link>
          )}
        </div>
      </header>

      {/* Vinkos · Nivel · Puntería */}
      {profile && (
        <Link href="/saldo" className="grid grid-cols-3 gap-2">
          <Stat icon={<VinkoCoin size={15} />} v={profile.points} l={t("saldo.coins")} c="var(--gold)" />
          <Stat icon="▲" v={profile.xp} l={t("saldo.level")} c="var(--win)" />
          <Stat icon="🎯" v={profile.marcador_total} l={t("saldo.skill")} c="var(--cream)" />
        </Link>
      )}

      {/* CREAR — lo primero que hay que ver */}
      <Link href={session ? "/nueva" : "/login?next=/nueva"}
        className="flex items-center justify-center gap-2 rounded-[14px] bg-[var(--win)] px-4 py-4 text-[16px] font-black text-[var(--ink)] shadow-[0_0_24px_rgba(31,224,122,0.25)]">
        <span className="text-xl leading-none">＋</span> {t("home.create")}
      </Link>

      {session && profile ? (
        <HoyClient
          daily={daily} myAnswer={myAnswer} prev={prev}
          streakDays={profile.streak_days} streakBest={profile.streak_best} shields={profile.streak_shields}
          bonusClaimedToday={profile.daily_bonus_last === today} bonusStep={profile.daily_bonus_step}
        />
      ) : (
        <div className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4 text-center">
          <p className="text-sm text-[var(--muted)]">{t("home.loginCard")}</p>
        </div>
      )}

      {/* HISTORIAS + FEED con apuesta inline (apk4) */}
      <FeedClient porras={feed} initialPicks={feedPicks} loggedIn={!!session} />

      <AppNav />
    </main>
  );
}

function Stat({ icon, v, l, c }: { icon: React.ReactNode; v: number; l: string; c: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-2 py-2.5 text-center">
      <div className="mono flex items-center justify-center gap-1 text-[15px] font-black leading-none" style={{ color: c }}>{icon} {v}</div>
      <div className="mt-1 text-[9px] uppercase tracking-wide text-[var(--muted)]">{l}</div>
    </div>
  );
}
