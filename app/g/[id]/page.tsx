import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMemberSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import type { LeaderRow } from "@/components/GroupLeaderboard";
import { fetchMe } from "@/lib/me";
import { GroupView, weekCutoff, type GroupInfo, type GroupPorraRow, type Shame } from "./group-view";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("grupo.standings"), robots: { index: false, follow: false } };

// Carga de datos de /g/[id]. Clasificación, racha y juez vienen del servidor
// (0035). Si la migración aún no está aplicada, cae al cálculo antiguo
// (marcador_total de los miembros) para que la página siga viva.
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getMemberSession();
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

  // FX-11: porras del grupo (RPC 0058, solo miembros). Pre-migración → lista vacía.
  let porras: GroupPorraRow[] = [];
  {
    const { data, error } = await sb!.rpc("group_porras", { p_group: id });
    if (!error && Array.isArray(data)) porras = data as GroupPorraRow[];
  }

  // VOTAR vs VER: tus picks en las abiertas (RLS picks_read_own) · zona del perfil.
  const openIds = porras.filter((p) => p.status === "open").map((p) => p.id);
  const lastDone = porras.find((p) => p.status === "resolved");
  const [mine, me, ranking] = await Promise.all([
    openIds.length ? sb!.from("picks").select("porra_id").eq("user_id", session!.id).in("porra_id", openIds) : Promise.resolve({ data: [] }),
    fetchMe(sb!),
    lastDone ? sb!.rpc("porra_ranking", { p_porra: lastDone.id }) : Promise.resolve({ data: [] }),
  ]);
  const voted = ((mine.data ?? []) as { porra_id: string }[]).map((r) => r.porra_id);

  // Recibo de vergüenza (VINKO_PANTALLAS 11): en la última resuelta, quien más
  // puso en una opción perdedora. Solo si alguien acertó (si no, fue devolución).
  let shame: Shame | null = null;
  if (lastDone) {
    type RankRow = { handle: string; avatar_url: string | null; option_label: string; stake: number; won: boolean };
    const rr = (Array.isArray(ranking.data) ? ranking.data : []) as RankRow[];
    const winner = rr.find((r) => r.won);
    const loser = rr.filter((r) => !r.won).sort((a, b) => b.stake - a.stake)[0];
    if (winner && loser) {
      shame = { who: loser.handle, avatar_url: loser.avatar_url, option: loser.option_label, winner: winner.option_label, title: lastDone.title, slug: lastDone.slug };
    }
  }

  return (
    <GroupView
      group={group}
      rows={rows}
      streak={streak}
      cutoffIso={weekCutoff().toISOString()}
      me={{ id: session!.id, handle: session!.handle ?? "" }}
      porras={porras}
      origin={origin}
      tz={me?.tz ?? "America/Bogota"}
      voted={voted}
      shame={shame}
    />
  );
}
