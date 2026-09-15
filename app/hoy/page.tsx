import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { HoyClient } from "@/components/HoyClient";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

// Pronóstico del día (§3.3, ancla 1) + racha + bonus diario. Es el hábito:
// una pregunta, todos los días, un toque. Sin esto no hay D30.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: t("hoy.title"),
  robots: { index: false, follow: false },
};

function madridDay(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}

export default async function Hoy() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("hoy.login")}</p>
        <Link
          href="/login?next=/hoy"
          className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]"
        >
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  const today = madridDay();
  const yesterday = madridDay(-1);

  const [{ data: daily }, { data: prev }, { data: profile }] = await Promise.all([
    sb!.from("daily_picks").select("*").eq("scheduled_for", today).eq("lang", "es").in("status", ["open", "resolved"]).maybeSingle(),
    sb!.from("daily_picks").select("*").eq("scheduled_for", yesterday).eq("lang", "es").eq("status", "resolved").maybeSingle(),
    sb!.from("profiles")
      .select("points, streak_days, streak_best, streak_shields, daily_bonus_last, daily_bonus_step, streak_recover_until, birth_year")
      .eq("id", session.id).maybeSingle(),
  ]);

  let myAnswer: number | null = null;
  let prevAnswer: { option_idx: number; correct: boolean | null; pts: number; score: number } | null = null;
  if (daily) {
    const { data } = await sb!.from("daily_pick_answers")
      .select("option_idx").eq("day_id", daily.id).eq("user_id", session.id).maybeSingle();
    myAnswer = data?.option_idx ?? null;
  }
  if (prev) {
    const { data } = await sb!.from("daily_pick_answers")
      .select("option_idx, correct, pts, score").eq("day_id", prev.id).eq("user_id", session.id).maybeSingle();
    prevAnswer = data ?? null;
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <span className="mono text-xs text-[var(--muted)]">@{session.handle}</span>
      </header>
      <HoyClient
        daily={daily ? {
          id: daily.id,
          question: daily.question,
          options: daily.options as string[],
          status: daily.status,
          correct_idx: daily.correct_idx,
        } : null}
        myAnswer={myAnswer}
        prev={prev ? {
          question: prev.question,
          options: prev.options as string[],
          correct_idx: prev.correct_idx,
          answer: prevAnswer,
        } : null}
        streakDays={profile?.streak_days ?? 0}
        streakBest={profile?.streak_best ?? 0}
        shields={profile?.streak_shields ?? 0}
        bonusClaimedToday={profile?.daily_bonus_last === today}
        bonusStep={profile?.daily_bonus_step ?? 0}
      />
      <AppNav />
    </main>
  );
}
