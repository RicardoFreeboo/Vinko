import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { getFeed } from "@/lib/feed";
import { HoyClient } from "@/components/HoyClient";
import { PorraCard } from "@/components/PorraCard";
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

  if (session && sb) {
    const [{ data: p }, { data: d }, { data: pv }] = await Promise.all([
      sb.from("profiles").select("points, xp, marcador_total, streak_days, streak_best, streak_shields, daily_bonus_last, daily_bonus_step").eq("id", session.id).maybeSingle(),
      sb.from("daily_picks").select("*").eq("scheduled_for", today).eq("lang", "es").in("status", ["open", "resolved"]).maybeSingle(),
      sb.from("daily_picks").select("*").eq("scheduled_for", yesterday).eq("lang", "es").eq("status", "resolved").maybeSingle(),
    ]);
    profile = (p as Profile | null) ?? null;
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

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-28 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        {session ? (
          <Link href="/saldo" className="mono text-xs text-[var(--muted)]">@{session.handle}</Link>
        ) : (
          <Link href="/login?next=/hoy" className="rounded-full bg-[var(--win)] px-3.5 py-1.5 text-[12px] font-black text-[var(--ink)]">
            {t("home.loginCta")}
          </Link>
        )}
      </header>

      {/* gamificación visible: Monedas · Nivel · Puntería · Racha */}
      {profile && (
        <Link href="/saldo" className="grid grid-cols-4 gap-2">
          <Stat icon="🪙" v={profile.points} l={t("saldo.coins")} c="var(--win)" />
          <Stat icon="▲" v={profile.xp} l={t("saldo.level")} c="var(--gold)" />
          <Stat icon="🎯" v={profile.marcador_total} l={t("saldo.skill")} c="var(--cream)" />
          <Stat icon="🔥" v={profile.streak_days} l={t("hoy.streak")} c="var(--gold)" />
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

      {/* FEED de porras con vídeo */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-black text-[var(--cream)]">{t("home.feed")}</h2>
          <span className="mono text-[11px] text-[var(--muted)]">{feed.length}</span>
        </div>
        {feed.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t("home.feedEmpty")}</p>
        ) : (
          feed.map((p) => <PorraCard key={p.id} p={p} />)
        )}
      </section>

      <AppNav />
    </main>
  );
}

function Stat({ icon, v, l, c }: { icon: string; v: number; l: string; c: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-2 py-2.5 text-center">
      <div className="mono text-[15px] font-black leading-none" style={{ color: c }}>{icon} {v}</div>
      <div className="mt-1 text-[9px] uppercase tracking-wide text-[var(--muted)]">{l}</div>
    </div>
  );
}
