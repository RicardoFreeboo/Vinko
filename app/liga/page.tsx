import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("liga.title"), robots: { index: false, follow: false } };

const DIV: Record<string, string> = {
  bronce: "Bronce", plata: "Plata", oro: "Oro", diamante: "Diamante", leyenda: "Leyenda",
};

function weekStartUTC(): string {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7; // lunes=0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export default async function Liga() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("liga.none")}</p>
        <Link href="/login?next=/liga" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  const week = weekStartUTC();
  const { data: profile } = await sb!.from("profiles").select("division").eq("id", session.id).maybeSingle();

  // mi grupo de liga de esta semana
  const { data: myGroup } = await sb!
    .from("league_members")
    .select("group_id, league_groups!inner ( week_start, division )")
    .eq("user_id", session.id)
    .eq("league_groups.week_start", week)
    .maybeSingle();

  let rows: { handle: string; score: number; me: boolean }[] = [];
  if (myGroup?.group_id) {
    const { data: members } = await sb!
      .from("league_members")
      .select("user_id, score, profiles ( handle )")
      .eq("group_id", myGroup.group_id);
    rows = (members ?? [])
      .map((m: { user_id: string; score: number; profiles: unknown }) => {
        const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { handle?: string } | null;
        return { handle: p?.handle ?? "?", score: m.score, me: m.user_id === session.id };
      })
      .sort((a, b) => b.score - a.score);
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <span className="text-sm font-black text-[var(--gold)]">{DIV[profile?.division ?? "bronce"]}</span>
      </header>
      <h1 className="text-2xl font-black">{t("liga.title")}</h1>
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {t("liga.week")} · {t("liga.cut")}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("liga.none")}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((r, i) => {
            const promo = i < 5;
            const releg = i >= rows.length - 5 && rows.length > 10;
            return (
              <li key={i}
                className="flex items-center justify-between rounded-[10px] border px-3 py-2.5"
                style={{ borderColor: r.me ? "var(--gold)" : "var(--line)" }}>
                <span className="flex items-center gap-2">
                  <span className="mono w-6 text-center text-sm font-black"
                    style={{ color: promo ? "var(--win)" : releg ? "var(--red)" : "var(--muted)" }}>
                    {i + 1}
                  </span>
                  <span className="font-bold text-[var(--cream)]">
                    @{r.handle}{r.me ? ` (${t("liga.you")})` : ""}
                  </span>
                </span>
                <span className="mono text-sm font-black text-[var(--win)]">🎯 {r.score}</span>
              </li>
            );
          })}
        </ol>
      )}
      <AppNav />
    </main>
  );
}
