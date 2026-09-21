import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { getFeed } from "@/lib/feed";
import { VerticalFeed } from "@/components/feed/VerticalFeed";
import { DailyPick } from "@/components/DailyPick";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

// FEED — pantalla de entrada de la app: feed VERTICAL a pantalla completa (una
// porra por pantalla, vídeo de fondo, pick inline). El pique del día va en el
// primer slide; el header (racha, buscar, campana) flota fijo encima.
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

  const btn = "grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/45 leading-none text-white backdrop-blur";

  return (
    <main className="amb min-h-dvh w-full">
      {/* header FIJO sobre el feed (el degradado superior de cada slide lo hace legible) */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto flex w-full max-w-[430px] items-center justify-between px-4 pt-3">
        <Link href="/feed" className="pointer-events-auto" aria-label={t("brand")}><Logo mark={28} word={20} /></Link>
        <div className="pointer-events-auto flex items-center gap-2.5">
          {session && (
            <span className="flex items-center gap-1 rounded-full border border-[var(--gold)]/50 bg-black/45 px-2.5 py-1 text-[13px] font-black text-[var(--gold)] backdrop-blur">
              🔥 {streak}
            </span>
          )}
          {session ? (
            <>
              <Link href="/buscar" aria-label={t("home.search")} className={`${btn} text-[16px]`}>🔍</Link>
              <Link href="/buzon" aria-label={t("home.notifications")} className={`relative ${btn} text-[17px]`}>
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

      <VerticalFeed porras={feed} initialPicks={feedPicks} loggedIn={!!session} now={Date.now()}
        intro={session ? (
          <DailyPick daily={daily} myAnswer={myAnswer} prev={prev} />
        ) : (
          <div className="rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-5 text-center">
            <p className="text-[20px] font-black leading-tight text-[var(--cream)] [text-wrap:balance]">{t("feed.introTitle")}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">{t("home.loginCard")}</p>
            <Link href="/login?next=/feed" className="mt-4 inline-block rounded-full bg-[var(--win)] px-5 py-2.5 text-[14px] font-black text-[var(--ink)]">
              {t("home.loginCta")}
            </Link>
          </div>
        )} />
      <AppNav />
    </main>
  );
}
