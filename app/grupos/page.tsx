import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { GruposClient } from "@/components/GruposClient";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("grupos.title"), robots: { index: false, follow: false } };

// ?join=<código>: enlace/QR de invitación. Con sesión entra al grupo (RPC
// join_group, idempotente) y salta a /g/[id]; sin sesión, el login vuelve aquí
// con el mismo código.
const CODE_RX = /^[a-z0-9]{4,32}$/i;

export default async function Grupos({ searchParams }: { searchParams: Promise<{ join?: string }> }) {
  const { join } = await searchParams;
  const code = typeof join === "string" && CODE_RX.test(join) ? join.toLowerCase() : null;
  const session = await getSession();
  if (!session) {
    const next = code ? `/grupos?join=${code}` : "/grupos";
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("grupos.login")}</p>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  let joinErr = false;
  if (code) {
    const { data, error } = await sb!.rpc("join_group", { p_code: code });
    if (!error && typeof data === "string") redirect(`/g/${data}`);
    joinErr = true;
  }

  const { data: memberships } = await sb!
    .from("group_members")
    .select("groups ( id, name, invite_code )")
    .eq("user_id", session.id);

  const groups = (memberships ?? [])
    .map((m: { groups: unknown }) => (Array.isArray(m.groups) ? m.groups[0] : m.groups))
    .filter(Boolean) as { id: string; name: string; invite_code: string }[];

  // conteo de miembros por grupo
  const counts: Record<string, number> = {};
  for (const g of groups) {
    const { count } = await sb!.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", g.id);
    counts[g.id] = count ?? 1;
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <span className="mono text-xs text-[var(--muted)]">@{session.handle}</span>
      </header>
      <h1 className="text-2xl font-black">{t("grupos.title")}</h1>
      {joinErr && <p className="text-center text-xs text-[var(--red)]">{t("grupos.joinFail")}</p>}
      <GruposClient
        groups={groups.map((g) => ({ ...g, members: counts[g.id] ?? 1 }))}
      />
      <AppNav />
    </main>
  );
}
