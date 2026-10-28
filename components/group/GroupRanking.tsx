"use client";
import { useMemo, useState } from "react";
import { ChevronRight, Crown } from "lucide-react";
import { Avatar } from "@/components/feed/Avatar";
import type { LeaderRow } from "@/components/GroupLeaderboard";
import { t } from "@/lib/i18n";

// Clasificación de la semana del grupo (VINKO_PANTALLAS 11): puesto (compartido
// en empates), avatar (corona al primero), quién es, a cuánto está del de
// arriba y sus puntos de la semana. Tu fila, resaltada en verde. Se ven 4 (y tú
// si vas más abajo); «Ver los N» despliega el resto.
const SHOW = 4;

export function GroupRanking({ rows, myId }: { rows: LeaderRow[]; myId: string }) {
  const [all, setAll] = useState(false);
  const ranked = useMemo(() => {
    const s = [...rows].sort((a, b) => b.skill_7d - a.skill_7d || b.skill_total - a.skill_total || a.handle.localeCompare(b.handle));
    return s.map((r, i) => {
      const place = s.findIndex((x) => x.skill_7d === r.skill_7d) + 1;
      // el más cercano por ENCIMA con más puntos (un empatado no cuenta)
      let above: LeaderRow | null = null;
      for (let j = i - 1; j >= 0; j--) if (s[j].skill_7d > r.skill_7d) { above = s[j]; break; }
      return { r, place, above };
    });
  }, [rows]);

  const scored = ranked.some((x) => x.r.skill_7d > 0);
  const mineAt = ranked.findIndex((x) => x.r.user_id === myId);
  const visible = all ? ranked
    : mineAt >= SHOW ? [...ranked.slice(0, SHOW - 1), ranked[mineAt]]
    : ranked.slice(0, SHOW);

  return (
    <section className="flex flex-col gap-1.5">
      {visible.map(({ r, place, above }) => {
        const me = r.user_id === myId;
        const first = scored && place === 1;
        const sub = !scored || !above
          ? t("grupo11.weekLine", { h: String(r.hits_7d), p: String(r.picks_7d) })
          : above.user_id === myId
            ? t("grupo11.gapToYou", { n: String(above.skill_7d - r.skill_7d) })
            : t("grupo11.gapTo", { n: String(above.skill_7d - r.skill_7d), who: `@${above.handle}` });
        return (
          <div key={r.user_id}
            className="flex items-center gap-3 rounded-[18px] border px-3.5 py-2.5"
            style={{ borderColor: me ? "rgba(31,224,122,0.35)" : "transparent", background: me ? "rgba(31,224,122,0.10)" : "transparent" }}>
            <span className="mono w-6 text-center text-[17px] font-bold" style={{ color: first ? "var(--gold)" : "var(--muted)" }}>{place}</span>
            <span className="relative">
              {first && <Crown size={20} aria-hidden className="absolute -top-4 left-1/2 -translate-x-1/2 text-[var(--gold)]" />}
              <Avatar handle={r.handle} url={r.avatar_url} size={44} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-bold text-[var(--cream)]">{me ? t("grupo11.you") : `@${r.handle}`}</span>
              <span className="block truncate text-[13.5px] text-[var(--muted)]">{sub}</span>
            </span>
            <span className="mono shrink-0 text-[19px] font-bold text-[var(--cream)]">{r.skill_7d}</span>
          </div>
        );
      })}
      {ranked.length > SHOW && (
        <button type="button" onClick={() => setAll((v) => !v)}
          className="mx-auto mt-1 flex items-center gap-1 text-[15px] font-semibold text-[var(--muted)]">
          {all ? t("grupo11.seeLess") : t("grupo11.seeAll", { n: String(ranked.length) })}
          <ChevronRight size={16} aria-hidden className={all ? "-rotate-90" : ""} />
        </button>
      )}
    </section>
  );
}
