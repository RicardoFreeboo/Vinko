import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { BuzonClient } from "@/components/BuzonClient";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("buzon.title"), robots: { index: false, follow: false } };

export default async function Buzon() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("buzon.login")}</p>
        <Link href="/login?next=/buzon" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  const { data: items } = await sb!
    .from("notifications")
    .select("id, class, title, body, url, read_at, created_at")
    .eq("user_id", session.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
      </header>
      <h1 className="text-2xl font-black">{t("buzon.title")}</h1>
      <BuzonClient items={items ?? []} />
      <AppNav />
    </main>
  );
}
