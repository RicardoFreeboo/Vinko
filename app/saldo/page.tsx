import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { SaldoClient } from "@/components/SaldoClient";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// Saldo del usuario + rewarded (ganar puntos viendo un anuncio). Requiere sesión
// y +18 declarado. El crédito lo hace el servidor (Edge Function). Sin sesión o
// sin año de nacimiento → se guía al paso que falta.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: t("saldo.title"),
  robots: { index: false, follow: false },
};

export default async function Saldo() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("saldo.login")}</p>
        <Link
          href="/login?next=/saldo"
          className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]"
        >
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  if (!session.birth_year) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("saldo.age")}</p>
        <Link
          href="/bienvenida?next=/saldo"
          className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]"
        >
          {t("saldo.ageCta")}
        </Link>
      </main>
    );
  }

  const isAdult = new Date().getFullYear() - session.birth_year >= 18;
  return (
    <SaldoClient
      initialPoints={session.points ?? 0}
      isAdult={isAdult}
      handle={session.handle}
    />
  );
}
