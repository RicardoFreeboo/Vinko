import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { SaldoClient } from "@/components/SaldoClient";
import { VinkosStreak } from "@/components/VinkosStreak";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

// Saldo + anuncios recompensados (placements R1/R2/R3/R6, §4.3). El crédito
// SIEMPRE lo hace el servidor (Edge Function → grant_ad_reward_v2). Los
// anuncios dan utilidad (PTS, escudo, boost), JAMÁS marcador (§0.2).
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

  const sb = await supabaseServer();
  const { data: p } = await sb!
    .from("profiles")
    .select("points, xp, marcador_total, streak_days, streak_best, streak_shields, streak_broken_days, streak_recover_until, division, daily_bonus_last, daily_bonus_step")
    .eq("id", session.id)
    .maybeSingle();

  const isAdult = new Date().getFullYear() - session.birth_year >= 18;
  const recoverable =
    !!p?.streak_recover_until && new Date(p.streak_recover_until) > new Date() &&
    (p?.streak_broken_days ?? 0) > 0;

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <span className="mono text-xs text-[var(--muted)]">@{session.handle}</span>
      </header>
      {/* RACHA SEMANAL arriba del todo (antes vivía en la pestaña Hoy) */}
      <VinkosStreak
        streakDays={p?.streak_days ?? 0}
        streakBest={p?.streak_best ?? 0}
        shields={p?.streak_shields ?? 0}
        bonusClaimedToday={p?.daily_bonus_last === new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" })}
        bonusStep={p?.daily_bonus_step ?? 0}
      />
      <SaldoClient
        initialPoints={p?.points ?? 0}
        xp={p?.xp ?? 0}
        marcador={p?.marcador_total ?? 0}
        division={p?.division ?? "bronce"}
        shields={p?.streak_shields ?? 0}
        isAdult={isAdult}
        recoverable={recoverable}
        brokenDays={p?.streak_broken_days ?? 0}
      />
      <AppNav />
    </main>
  );
}
