import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { KycLevels } from "@/components/KycLevels";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("kyc.title"), robots: { index: false, follow: false } };

// Verificación por niveles (§5.7; Fase 0 del acuerdo Luckia). Nivel actual:
// 0 sin sesión · 1 con año de nacimiento · 2/3 según el KYC del proveedor
// (money_accounts.kyc_level, que llega por webhook). Sin captura real aquí.
export default async function Verificar() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("saldo.login")}</p>
        <Link href="/login?next=/verificar" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  let level = session.birth_year ? 1 : 0;
  const sb = await supabaseServer();
  if (sb) {
    const { data } = await sb.from("money_accounts").select("kyc_level").eq("user_id", session.id).maybeSingle();
    const k = (data as { kyc_level?: number } | null)?.kyc_level ?? 0;
    if (k > level) level = k;
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <Link href="/cartera" className="mono text-[11px] text-[var(--muted)]">{t("cartera.back")}</Link>
      </header>
      <h1 className="text-2xl font-black">{t("kyc.title")}</h1>
      <p className="text-[13px] leading-snug text-[var(--muted)]">{t("kyc.intro")}</p>
      <KycLevels current={level} />
      <AppNav />
    </main>
  );
}
