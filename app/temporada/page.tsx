import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { getConfig } from "@/lib/config";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("temporada.title"), robots: { index: false, follow: false } };

export default async function Temporada() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("temporada.login")}</p>
        <Link href="/login?next=/temporada" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  const misc = await getConfig("misc");
  const tierXp = Number(misc.season_tier_xp ?? 1000);
  const totalTiers = Number(misc.season_tiers ?? 40);

  const { data: season } = await sb!
    .from("seasons").select("*").lte("starts_at", new Date().toISOString().slice(0, 10))
    .gte("ends_at", new Date().toISOString().slice(0, 10)).order("number", { ascending: false }).maybeSingle();

  if (!season) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-24 pt-6">
        <Logo mark={28} word={20} />
        <p className="text-sm text-[var(--muted)]">{t("temporada.none")}</p>
        <AppNav />
      </main>
    );
  }

  const { data: prog } = await sb!
    .from("season_progress").select("xp, tier").eq("season_id", season.id).eq("user_id", session.id).maybeSingle();
  const xp = prog?.xp ?? 0;
  const tier = Math.min(Math.floor(xp / tierXp), totalTiers);
  const intoTier = xp % tierXp;
  const pct = Math.round((intoTier / tierXp) * 100);

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <span className="mono text-xs text-[var(--muted)]">{season.name}</span>
      </header>
      <h1 className="text-2xl font-black">{t("temporada.path")}</h1>

      <div className="rounded-[16px] border border-[var(--gold)] bg-[var(--ink2)] p-5 text-center">
        <div className="text-4xl font-black text-[var(--gold)]">{t("temporada.stage", { n: String(tier) })}</div>
        <div className="mt-1 text-[12px] text-[var(--muted)]">{t("temporada.stageOf", { a: String(tier), b: String(totalTiers) })}</div>
        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[var(--ink)]">
          <div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 text-xs text-[var(--muted)]">{t("temporada.next", { n: String(tierXp - intoTier) })}</div>
      </div>

      <p className="text-center text-xs text-[var(--muted2)]">
        {t("temporada.ends", { date: new Date(season.ends_at).toLocaleDateString("es-ES", { day: "numeric", month: "long" }) })}
      </p>
      <AppNav />
    </main>
  );
}
