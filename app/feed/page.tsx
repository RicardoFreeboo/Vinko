import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { getFeed } from "@/lib/feed";
import { FeedClient } from "@/components/feed/FeedClient";
import { DailyPick } from "@/components/DailyPick";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

// FEED — pantalla de entrada de la app (sustituye a la antigua "Hoy"):
// el pique del día arriba y debajo las porras con apuesta inline.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("feed.title"), robots: { index: false, follow: false } };

function madridDay(offset = 0): string {
  return new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}

export default async function Feed() {
  const [session, feed] = await Promise.all([getSession(), getFeed()]);
  const sb = await supabaseServer();
  const today = madridDay(), yesterday = madridDay(-1);

  let streak = 0, unread = 0;
  let daily: { id: string; question: string; options: string[]; status: string; correct_idx: number | null } | null = null;
  let myAnswer: number | null = null;
  let prev: { question: string; options: string[]; correct_idx: number | null;
    answer: { option_idx: number; correct: boolean | null; pts: number; score: number } | null } | null = null;
  const feedPicks: Record<string, string> = {};

  if (session && sb) {
    const [{ data: p }, { data: d }, { data: pv }, { count: n }] = await Promise.all([
      sb.from("profiles").select("streak_days").eq("id", session.id).maybeSingle(),
      sb.from("daily_picks").select("*").eq("scheduled_for", today).eq("lang", "es").in("status", ["open", "resolved"]).maybeSingle(),
      sb.from("daily_picks").select("*").eq("scheduled_for", yesterday).eq("lang", "es").eq("status", "resolved").maybeSingle(),
      sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", session.id).is("read_at", null),
    ]);
    streak = p?.streak_days ?? 0;
    unread = n ?? 0;
    if (d) {
      daily = { id: d.id, question: d.question, options: d.options as string[], status: d.status, correct_idx: d.correct_idx };
      const { data: a } = await sb.from("daily_pick_answers").select("option_idx").eq("day_id", d.id).eq("user_id", session.id).maybeSingle();
      myAnswer = a?.option_idx ?? null;
    }
    if (pv) {
      const { data: a } = await sb.from("daily_pick_answers").select("option_idx, correct, pts, score").eq("day_id", pv.id).eq("user_id", session.id).maybeSingle();
      prev = { question: pv.question, options: pv.options as string[], correct_idx: pv.correct_idx, answer: a ?? null };
    }
    if (feed.length) {
      const { data } = await sb.from("picks").select("porra_id, option_id").eq("user_id", session.id).in("porra_id", feed.map((f) => f.id));
      for (const pk of data ?? []) feedPicks[pk.porra_id] = pk.option_id;
    }
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-28 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <div className="flex items-center gap-2.5">
          {session && (
            <span className="flex items-center gap-1 rounded-full border border-[var(--gold)]/50 bg-[var(--gold)]/10 px-2.5 py-1 text-[13px] font-black text-[var(--gold)]">
              🔥 {streak}
            </span>
          )}
          {session ? (
            <>
              <Link href="/buscar" aria-label={t("home.search")}
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--ink2)] text-[16px] leading-none">🔍</Link>
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
            <Link href="/login?next=/feed" className="rounded-full bg-[var(--win)] px-3.5 py-1.5 text-[12px] font-black text-[var(--ink)]">
              {t("home.loginCta")}
            </Link>
          )}
        </div>
      </header>

      {session ? (
        <DailyPick daily={daily} myAnswer={myAnswer} prev={prev} />
      ) : (
        <div className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4 text-center">
          <p className="text-sm text-[var(--muted)]">{t("home.loginCard")}</p>
        </div>
      )}

      <FeedClient porras={feed} initialPicks={feedPicks} loggedIn={!!session} />
      <AppNav />
    </main>
  );
}
