import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import type { LeaderRow } from "@/components/GroupLeaderboard";
import { GroupView, weekCutoff, type GroupInfo } from "./group-view";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("grupo.standings"), robots: { index: false, follow: false } };

// Carga de datos de /g/[id]. Clasificación, racha y juez vienen del servidor
// (0035). Si la migración aún no está aplicada, cae al cálculo antiguo
// (marcador_total de los miembros) para que la página siga viva.
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) { notFound(); }

  const sb = await supabaseServer();
  let group: GroupInfo | null = null;
  {
    const { data } = await sb!.from("groups").select("id, name, invite_code, created_by, judge_id").eq("id", id).maybeSingle();
    if (data) group = data as GroupInfo;
    else {
      const { data: old } = await sb!.from("groups").select("id, name, invite_code, created_by").eq("id", id).maybeSingle();
      if (old) group = { ...(old as Omit<GroupInfo, "judge_id">), judge_id: null };
    }
  }
  if (!group) notFound();

  const [lb, st] = await Promise.all([
    sb!.rpc("group_leaderboard", { p_group: id }),
    sb!.rpc("group_streak", { p_group: id }),
  ]);

  let rows: LeaderRow[] = Array.isArray(lb.data) ? (lb.data as LeaderRow[]) : [];
  if (lb.error || rows.length === 0) {
    // respaldo pre-0035: miembros + marcador_total
    const { data: members } = await sb!
      .from("group_members")
      .select("user_id, profiles ( handle, avatar_url, marcador_total )")
      .eq("group_id", id);
    rows = (members ?? [])
      .map((m: { user_id: string; profiles: unknown }) => {
        const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
          | { handle?: string; avatar_url?: string | null; marcador_total?: number } | null;
        return {
          user_id: m.user_id, handle: p?.handle ?? "?", avatar_url: p?.avatar_url ?? null, title: null,
          skill_total: p?.marcador_total ?? 0, skill_7d: 0, picks_7d: 0, hits_7d: 0, rank: 0,
        };
      })
      .sort((a, b) => b.skill_total - a.skill_total)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }
  const streak = typeof st.data === "number" ? st.data : 0;
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vinko.fun";

  // pay_handle (cómo te pagan los del grupo). Puede no existir aún si 0048 no
  // está aplicada: en ese caso, null y el usuario lo rellena cuando aparezca.
  let payHandle: string | null = null;
  {
    const { data: prof } = await sb!.from("profiles").select("pay_handle").eq("id", session!.id).maybeSingle();
    payHandle = (prof as { pay_handle?: string | null } | null)?.pay_handle ?? null;
  }

  // Gate del P2P con dinero (0054): apagado por defecto; solo se muestra si el
  // admin lo enciende en remote_config.p2p.enabled.
  let moneyEnabled = false;
  {
    const { data: cfg } = await sb!.from("remote_config").select("value").eq("key", "p2p").maybeSingle();
    moneyEnabled = (cfg as { value?: { enabled?: boolean } } | null)?.value?.enabled === true;
  }

  return (
    <GroupView
      group={group}
      rows={rows}
      streak={streak}
      cutoffIso={weekCutoff().toISOString()}
      me={{ id: session!.id, handle: session!.handle ?? "", payHandle,
        isAdult: !!session!.birth_year && new Date().getFullYear() - session!.birth_year >= 18 }}
      moneyEnabled={moneyEnabled}
      origin={origin}
    />
  );
}
