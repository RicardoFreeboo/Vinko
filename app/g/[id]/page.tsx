import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { GroupShare } from "@/components/GroupShare";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("grupo.standings"), robots: { index: false, follow: false } };

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) { notFound(); }

  const sb = await supabaseServer();
  const { data: group } = await sb!.from("groups").select("id, name, invite_code").eq("id", id).maybeSingle();
  if (!group) notFound();

  // clasificación por Puntería del grupo
  const { data: members } = await sb!
    .from("group_members")
    .select("user_id, profiles ( handle, marcador_total )")
    .eq("group_id", id);

  const rows = (members ?? [])
    .map((m: { user_id: string; profiles: unknown }) => {
      const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
        | { handle?: string; marcador_total?: number } | null;
      return { user_id: m.user_id, handle: p?.handle ?? "?", score: p?.marcador_total ?? 0 };
    })
    .sort((a, b) => b.score - a.score);

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vinko.fun";

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={26} word={18} />
        <Link href="/grupos" className="mono text-[11px] text-[var(--muted)]">{t("grupo.back")}</Link>
      </header>
      <h1 className="text-2xl font-black">{group.name}</h1>
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("grupo.standings")}</p>

      {rows.every((r) => r.score === 0) ? (
        <p className="text-sm text-[var(--muted)]">{t("grupo.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li key={r.user_id}
              className="flex items-center justify-between rounded-[10px] border px-3 py-2.5"
              style={{ borderColor: r.user_id === session!.id ? "var(--gold)" : "var(--line)" }}>
              <span className="flex items-center gap-2">
                <span className="mono w-6 text-center text-sm font-black text-[var(--muted)]">{i + 1}</span>
                <span className="font-bold text-[var(--cream)]">
                  @{r.handle}{r.user_id === session!.id ? ` (${t("grupo.you")})` : ""}
                </span>
              </span>
              <span className="mono text-sm font-black text-[var(--win)]">🎯 {r.score}</span>
            </li>
          ))}
        </ol>
      )}

      <GroupShare
        code={group.invite_code}
        name={group.name}
        rows={rows.slice(0, 5).map((r) => ({ handle: r.handle, score: r.score }))}
        url={origin}
      />
      <AppNav />
    </main>
  );
}
