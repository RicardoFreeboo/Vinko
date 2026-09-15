import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { BuscarClient } from "@/components/BuscarClient";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

// Buscar / descubrir perfiles (como Instagram). Ver a la gente y sus porras.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("buscar.title"), robots: { index: false, follow: false } };

export default async function Buscar() {
  const session = await getSession();
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-28 pt-6">
      <header className="flex items-center justify-between">
        <Link href="/feed"><Logo mark={28} word={20} /></Link>
        <Link href="/feed" className="mono text-xs text-[var(--muted)]">← {t("legal.back")}</Link>
      </header>
      <h1 className="text-xl font-black text-[var(--cream)]">{t("buscar.title")}</h1>
      <BuscarClient />
      {session && <AppNav />}
    </main>
  );
}
