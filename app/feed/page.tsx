import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { getFeed } from "@/lib/feed";
import { FeedClient } from "@/components/feed/FeedClient";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

// FEED: la pestaña de porras (historias + tarjetas con apuesta inline). Su sitio
// propio en el nav, separado de Hoy (que es el panel: racha, pique, stats).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("feed.title"), robots: { index: false, follow: false } };

export default async function Feed() {
  const [session, feed] = await Promise.all([getSession(), getFeed()]);
  const sb = await supabaseServer();

  const feedPicks: Record<string, string> = {};
  if (session && sb && feed.length) {
    const { data } = await sb.from("picks").select("porra_id, option_id").eq("user_id", session.id).in("porra_id", feed.map((f) => f.id));
    for (const pk of data ?? []) feedPicks[pk.porra_id] = pk.option_id;
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-28 pt-6">
      <header className="flex items-center justify-between">
        <Link href="/hoy"><Logo mark={28} word={20} /></Link>
        <Link href={session ? "/nueva" : "/login?next=/nueva"}
          className="rounded-full bg-[var(--win)] px-3.5 py-1.5 text-[12px] font-black text-[var(--ink)]">
          ＋ {t("home.create")}
        </Link>
      </header>
      <FeedClient porras={feed} initialPicks={feedPicks} loggedIn={!!session} />
      <AppNav />
    </main>
  );
}
