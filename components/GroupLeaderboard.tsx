"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Avatar } from "@/components/feed/Avatar";
import { t } from "@/lib/i18n";

// Clasificación permanente del grupo por Puntería (F-06): pestañas "Esta
// semana" / "Total", podio de 3, mi fila resaltada y el corte semanal (fijo
// domingo 20:00 UTC) mostrado en la hora local del usuario. Las filas llegan
// del RPC group_leaderboard (solo miembros); aquí no se calcula nada de
// puntos, solo se ordena y se pinta.

export type LeaderRow = {
  user_id: string;
  handle: string;
  avatar_url: string | null;
  title: string | null;
  skill_total: number;
  skill_7d: number;
  picks_7d: number;
  hits_7d: number;
  rank: number;
};

type Tab = "week" | "total";
const MEDAL = ["var(--gold)", "#c9d1cf", "var(--golddeep)"];

function useLocalCutoff(cutoffIso: string): string {
  // SSR: texto UTC (igual en servidor y cliente); tras montar, hora local.
  const [txt, setTxt] = useState(t("grupo.cutoffUtc"));
  useEffect(() => {
    const next = new Date(cutoffIso);
    if (Number.isNaN(next.getTime())) return;
    next.setUTCDate(next.getUTCDate() + 7);
    const when = next.toLocaleString("es-ES", { weekday: "long", hour: "2-digit", minute: "2-digit" });
    setTxt(t("grupo.cutoff", { when }));
  }, [cutoffIso]);
  return txt;
}

export function GroupLeaderboard({ rows, myId, cutoffIso, initialTab = "week" }: {
  rows: LeaderRow[]; myId: string; cutoffIso: string; initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const cutoff = useLocalCutoff(cutoffIso);

  const sorted = useMemo(() => {
    const val = (r: LeaderRow) => (tab === "week" ? r.skill_7d : r.skill_total);
    return [...rows].sort((a, b) => val(b) - val(a) || b.skill_total - a.skill_total || a.handle.localeCompare(b.handle));
  }, [rows, tab]);
  const value = (r: LeaderRow) => (tab === "week" ? r.skill_7d : r.skill_total);
  const anyScore = sorted.some((r) => value(r) > 0);
  const podium = anyScore ? sorted.slice(0, 3) : [];
  // podio visual: 2.º · 1.º · 3.º
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean) as LeaderRow[];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div role="tablist" className="flex rounded-full border border-[var(--line)] bg-[var(--ink2)] p-0.5">
          {(["week", "total"] as Tab[]).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-black transition ${
                tab === k ? "bg-[var(--win)] text-[var(--ink)]" : "text-[var(--muted)]"}`}>
              {t(k === "week" ? "grupo.tabWeek" : "grupo.tabTotal")}
            </button>
          ))}
        </div>
        <span className="mono text-[10px] text-[var(--muted)]" suppressHydrationWarning>{cutoff}</span>
      </div>

      {!anyScore ? (
        <p className="text-sm text-[var(--muted)]">{t(tab === "week" ? "grupo.weekEmpty" : "grupo.empty")}</p>
      ) : (
        <div className="flex items-end justify-center gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-3 pb-3 pt-4">
          {podiumOrder.map((r) => {
            const place = podium.indexOf(r) + 1;
            const big = place === 1;
            return (
              <div key={r.user_id} className="flex w-[30%] flex-col items-center gap-1" style={{ paddingBottom: big ? 8 : 0 }}>
                <span className="mono grid h-6 w-6 place-items-center rounded-full text-[12px] font-black text-[var(--ink)]"
                  style={{ background: MEDAL[place - 1] }}>{place}</span>
                <span className="rounded-full" style={{ boxShadow: `0 0 0 3px ${MEDAL[place - 1]}` }}>
                  <Avatar handle={r.handle} url={r.avatar_url} size={big ? 56 : 44} />
                </span>
                <span className="max-w-full truncate text-[12px] font-black text-[var(--cream)]">@{r.handle}</span>
                <span className="mono text-[13px] font-black text-[var(--win)]">🎯 {value(r)}</span>
              </div>
            );
          })}
        </div>
      )}

      <ol className="flex flex-col gap-1.5">
        {sorted.map((r, i) => {
          const me = r.user_id === myId;
          return (
            <li key={r.user_id}
              className="flex items-center justify-between rounded-[10px] border px-3 py-2"
              style={{ borderColor: me ? "var(--gold)" : "var(--line)", background: me ? "rgba(255,194,61,0.06)" : "transparent" }}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="mono w-5 text-center text-sm font-black text-[var(--muted)]">{i + 1}</span>
                <Avatar handle={r.handle} url={r.avatar_url} size={28} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-bold text-[var(--cream)]">
                    @{r.handle}{me ? ` (${t("grupo.you")})` : ""}
                  </span>
                  <span className="mono truncate text-[10px] text-[var(--muted)]">
                    {r.title ? `${r.title} · ` : ""}
                    {tab === "week"
                      ? t("grupo.weekLine", { p: String(r.picks_7d), h: String(r.hits_7d) })
                      : t("grupo.totalLine", { n: String(r.skill_7d) })}
                  </span>
                </span>
              </span>
              <span className="mono shrink-0 text-sm font-black text-[var(--win)]">🎯 {value(r)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Juez del grupo (F-06): el admin delega quién resuelve las porras del grupo.
// Solo el admin ve el selector; el cambio va por RPC set_group_judge.
export function GroupJudge({ groupId, judgeId, adminId, members, myId }: {
  groupId: string;
  judgeId: string | null;
  adminId: string;
  members: { user_id: string; handle: string }[];
  myId: string;
}) {
  const router = useRouter();
  const effective = judgeId ?? adminId;
  const judge = members.find((m) => m.user_id === effective);
  const isAdmin = myId === adminId;
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState(effective);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setMsg(null);
    const { error } = await sb.rpc("set_group_judge", { p_group: groupId, p_user: sel === adminId ? null : sel });
    setBusy(false);
    if (error) { setMsg(t("grupo.judgeError")); return; }
    setMsg(t("grupo.judgeSaved"));
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-[var(--cream)]">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("grupo.judge")}</span>{" "}
          <span className="font-black">@{judge?.handle ?? "?"}</span>
          {effective === adminId && <span className="ml-1 text-[11px] text-[var(--muted)]">{t("grupo.judgeAdmin")}</span>}
        </span>
        {isAdmin && !editing && (
          <button onClick={() => setEditing(true)} className="mono text-[11px] font-black text-[var(--win)]">
            {t("grupo.judgeChange")}
          </button>
        )}
      </div>
      {isAdmin && editing && (
        <div className="flex gap-2">
          <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label={t("grupo.judge")}
            className="flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]">
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>@{m.handle}{m.user_id === adminId ? ` ${t("grupo.judgeAdmin")}` : ""}</option>
            ))}
          </select>
          <button onClick={save} disabled={busy}
            className="rounded-[10px] bg-[var(--win)] px-3 text-sm font-black text-[var(--ink)] disabled:opacity-50">
            {t("grupo.judgeSave")}
          </button>
        </div>
      )}
      <p className="text-[11px] text-[var(--muted)]">{msg ?? t("grupo.judgeHint")}</p>
    </div>
  );
}
