import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { SaferPlayClient, type SaferState } from "@/components/SaferPlayClient";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("safer.title"), robots: { index: false, follow: false } };

// Juego más seguro (§5.11 / RD 176/2023; §8 del acuerdo Luckia). Accesible desde
// la Cartera. La preferencia del usuario (autoexclusión, límites) apaga su UI de
// dinero; la aplicación real sobre cuentas la hace el operador en producción.
export default async function JuegoSeguro() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("saldo.login")}</p>
        <Link href="/login?next=/juego-seguro" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  let initial: SaferState = { self_excluded_until: null, is_excluded: false, limits: {} };
  if (sb) {
    const { data } = await sb.rpc("safer_play_get");
    if (data) initial = data as SaferState;
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <Link href="/cartera" className="mono text-[11px] text-[var(--muted)]">{t("cartera.back")}</Link>
      </header>
      <h1 className="text-2xl font-black">{t("safer.title")}</h1>
      <p className="text-[13px] leading-snug text-[var(--muted)]">{t("safer.intro")}</p>
      <SaferPlayClient initial={initial} />
      <AppNav />
    </main>
  );
}
