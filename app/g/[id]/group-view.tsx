import Link from "next/link";
import { ChevronLeft, Crown, Share2, UserPlus } from "lucide-react";
import { GroupShare } from "@/components/GroupShare";
import type { LeaderRow } from "@/components/GroupLeaderboard";
import { GroupRanking } from "@/components/group/GroupRanking";
import { Avatar } from "@/components/feed/Avatar";
import { AppNav } from "@/components/AppNav";
import { leftLabel, whenLabel } from "@/lib/when";
import { qrSvg } from "./qr";
import { t } from "@/lib/i18n";

// Vista de /g/[id] (VINKO_PANTALLAS 11) separada de la carga de datos
// (page.tsx): así se puede pintar con datos de prueba sin sesión ni Supabase.
// Cabecera (volver · nombre, personas y racha de grupo · invitar), quien lidera
// la semana, la clasificación de la semana, las predicciones del grupo, el
// «recibo de vergüenza» de la última resuelta y, abajo, invitar (enlace,
// WhatsApp, recap y QR).

export type GroupInfo = {
  id: string; name: string; invite_code: string; created_by: string; judge_id: string | null;
};

// FX-11: fila de group_porras (RPC 0058; sin premio desde 0061)
export type GroupPorraRow = {
  id: string; slug: string; title: string; status: string; closes_at: string;
  creator: string | null; picks: number;
};

// Quien más puso en la opción perdedora de la última resuelta (porra_ranking).
export type Shame = { who: string; avatar_url: string | null; option: string; winner: string; title: string; slug: string };

// Último domingo 20:00 UTC (misma fórmula que group_week_cutoff() en SQL).
export function weekCutoff(now: Date = new Date()): Date {
  const d = new Date(now.getTime() + 4 * 3600e3);
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return new Date(monday - 4 * 3600e3);
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function GroupView({ group, rows, streak, cutoffIso, me, porras = [], origin, tz, voted = [], shame = null }: {
  group: GroupInfo;
  rows: LeaderRow[];
  streak: number;
  cutoffIso: string;
  me: { id: string; handle: string };
  porras?: GroupPorraRow[];
  origin: string;
  tz?: string;
  voted?: string[];
  shame?: Shame | null;
}) {
  const joinUrl = `${origin}/grupos?join=${group.invite_code}`;
  const recapUrl = `${origin}/api/g/${group.id}/recap?c=${group.invite_code}&u=${encodeURIComponent(me.handle)}`;
  const storyUrl = `${recapUrl}&format=story`;
  const qr = qrSvg(joinUrl);
  const byWeek = [...rows].sort((a, b) => b.skill_7d - a.skill_7d || b.skill_total - a.skill_total || a.handle.localeCompare(b.handle));
  const top = byWeek.slice(0, 5);
  const king = byWeek[0] && byWeek[0].skill_7d > 0 ? byWeek[0] : null;
  const nextCut = new Date(new Date(cutoffIso).getTime() + 7 * 86400e3).toISOString();
  const votedSet = new Set(voted);
  const now = Date.now();
  const list = porras.filter((p) => p.status !== "taken_down");
  const shameText = shame
    ? t("grupo11.shameText", { who: `@${shame.who}`, option: shame.option, title: shame.title, winner: shame.winner, url: `${origin}/p/${shame.slug}` })
    : "";

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-[18px] pb-28 pt-2">
      <header className="grid grid-cols-[40px_1fr_40px] items-center gap-2 py-2">
        <Link href="/grupos" aria-label={t("grupo.back")}
          className="grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--ink2)] text-[var(--cream)]">
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-[22px] font-black leading-tight tracking-[-0.03em] text-[var(--cream)]">{group.name}</h1>
          <p className="truncate text-[14px] text-[var(--muted)]">
            {t("grupo11.people", { n: String(rows.length) })} · {t("grupo11.streak")}{" "}
            <span className="font-bold text-[var(--gold)]">🔥 {streak}</span>
          </p>
        </div>
        <a href="#invitar" aria-label={t("grupo11.invite")}
          className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(31,224,122,0.35)] bg-[rgba(31,224,122,0.10)] text-[var(--win)]">
          <UserPlus size={19} aria-hidden />
        </a>
      </header>

      {/* quien lidera la semana */}
      {king ? (
        <section className="flex items-center gap-4 rounded-[20px] border border-[rgba(255,194,61,0.35)] p-4"
          style={{ background: "linear-gradient(135deg, rgba(255,194,61,0.10), rgba(255,194,61,0.03))" }}>
          <span className="relative mt-2 shrink-0">
            <Crown size={30} aria-hidden className="absolute -top-6 left-1/2 -translate-x-1/2 text-[var(--gold)]" />
            <Avatar handle={king.handle} url={king.avatar_url} size={64} />
          </span>
          <div className="min-w-0">
            <div className="mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold)]">{t("grupo11.kingEyebrow")}</div>
            <div className="mt-1 truncate text-[26px] font-black leading-tight tracking-[-0.03em] text-[var(--cream)]">
              @{king.handle} · {t("grupo11.kingPts", { pts: String(king.skill_7d) })}
            </div>
            <div className="mt-0.5 text-[13px] text-[var(--muted)]">
              {t("grupo11.cutoff", { when: lower(whenLabel(nextCut, tz)), left: leftLabel(nextCut) })}
            </div>
          </div>
        </section>
      ) : (
        <p className="rounded-[20px] border border-dashed border-[var(--line2)] p-4 text-center text-[14px] text-[var(--muted)]">
          {t("grupo11.noScore")}
        </p>
      )}

      <GroupRanking rows={rows} myId={me.id} />

      {/* predicciones del grupo */}
      <section className="flex flex-col gap-2.5">
        <div className="mt-2 flex items-baseline justify-between">
          <h2 className="text-[18px] font-bold tracking-[-0.01em] text-[var(--cream)]">{t("grupo11.porras")}</h2>
          <Link href={`/nueva?g=${group.id}`} className="text-[13px] text-[var(--muted)]">{t("grupo11.create")}</Link>
        </div>
        {list.length === 0 ? (
          <Link href={`/nueva?g=${group.id}`}
            className="rounded-[20px] border border-dashed border-[var(--line2)] p-4 text-center text-[14px] text-[var(--muted)]">
            {t("grupo11.empty")}
          </Link>
        ) : list.map((p) => {
          const open = p.status === "open" && new Date(p.closes_at).getTime() > now;
          const canVote = open && !votedSet.has(p.id);
          const sub = open
            ? t("grupo11.porraOpen", { n: String(p.picks), m: String(rows.length), when: lower(whenLabel(p.closes_at, tz)) })
            : p.status === "open" ? t("grupo11.porraClosed") : t("grupo11.porraDone", { n: String(p.picks) });
          return (
            <Link key={p.id} href={`/p/${p.slug}`}
              className="flex items-center gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-[15px]">
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-[17px] font-bold leading-tight text-[var(--cream)]">{p.title}</span>
                <span className="mt-1 block truncate text-[13.5px] text-[var(--muted)]">{sub}</span>
              </span>
              <span className="mono shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.1em]"
                style={canVote
                  ? { borderColor: "rgba(31,224,122,0.45)", color: "var(--win)", background: "rgba(31,224,122,0.08)" }
                  : { borderColor: "var(--line)", color: "var(--muted)" }}>
                {canVote ? t("grupo11.vote") : t("grupo11.view")}
              </span>
            </Link>
          );
        })}
      </section>

      {/* recibo de vergüenza: quien más puso en lo que no pasó */}
      {shame && (
        <section className="rounded-[20px] border border-[rgba(255,95,162,0.3)] bg-[rgba(255,95,162,0.06)] p-[15px]">
          <div className="flex items-center gap-3">
            <Avatar handle={shame.who} url={shame.avatar_url} size={44} />
            <p className="min-w-0 text-[16px] leading-snug text-[var(--cream)]">
              <b>@{shame.who}</b> {t("grupo11.shameSure", { option: shame.option })} 🤡
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a href={`https://wa.me/?text=${encodeURIComponent(shameText)}`} target="_blank" rel="noopener noreferrer"
              className="mono inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line2)] bg-[var(--ink3)] px-4 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--cream)]">
              <Share2 size={16} aria-hidden /> {t("grupo11.shameShare")}
            </a>
            <span className="text-[14px] text-[var(--muted)]">{t("grupo11.shameWon", { winner: shame.winner })}</span>
          </div>
        </section>
      )}

      {/* invitar: enlace, WhatsApp, recap y QR (grupos presenciales: boda, bar) */}
      <section id="invitar" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="mt-2 text-[18px] font-bold tracking-[-0.01em] text-[var(--cream)]">{t("grupo11.inviteTitle")}</h2>
        <GroupShare
          code={group.invite_code}
          name={group.name}
          rows={top.map((r) => ({ handle: r.handle, score: r.skill_7d > 0 ? r.skill_7d : r.skill_total }))}
          url={joinUrl}
          recapUrl={recapUrl}
          storyUrl={storyUrl}
        />
        <div className="flex flex-col items-center gap-2 rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("grupo.qrTitle")}</p>
          <svg viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} width={180} height={180} role="img"
            aria-label={t("grupo.qrTitle")} shapeRendering="crispEdges" className="rounded-[10px]">
            <rect x={-4} y={-4} width={qr.size + 8} height={qr.size + 8} fill="#f4f1e9" />
            <path d={qr.path} fill="#0c1011" />
          </svg>
          <p className="mono text-[12px] font-black text-[var(--cream)]">{t("grupo.qrCode", { code: group.invite_code })}</p>
          <p className="text-center text-[11px] text-[var(--muted)]">{t("grupo.qrHint")}</p>
        </div>
      </section>

      <AppNav />
    </main>
  );
}
