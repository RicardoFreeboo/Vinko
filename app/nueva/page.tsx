import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { NuevaClient } from "@/components/NuevaClient";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("nueva.title"), robots: { index: false, follow: false } };

export default async function Nueva() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("nueva.login")}</p>
        <Link href="/login?next=/nueva" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vinko.fun";
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <span className="mono text-xs text-[var(--muted)]">@{session.handle}</span>
      </header>
      <h1 className="text-2xl font-black">{t("nueva.title")}</h1>
      <NuevaClient userId={session.id} origin={origin} />
      <AppNav />
    </main>
  );
}
