import Link from "next/link";
import { GroupShare } from "@/components/GroupShare";
import { GroupLeaderboard, GroupJudge, type LeaderRow } from "@/components/GroupLeaderboard";
import { GroupMoney } from "@/components/GroupMoney";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { qrSvg } from "./qr";
import { t } from "@/lib/i18n";

// Vista de /g/[id] separada de la carga de datos (page.tsx): así se puede
// pintar con datos de prueba en la verificación sin sesión ni Supabase.

export type GroupInfo = {
  id: string; name: string; invite_code: string; created_by: string; judge_id: string | null;
};

// Último domingo 20:00 UTC (misma fórmula que group_week_cutoff() en SQL).
export function weekCutoff(now: Date = new Date()): Date {
  const d = new Date(now.getTime() + 4 * 3600e3);
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return new Date(monday - 4 * 3600e3);
}

export function GroupView({ group, rows, streak, cutoffIso, me, moneyEnabled = false, origin }: {
  group: GroupInfo;
  rows: LeaderRow[];
  streak: number;
  cutoffIso: string;
  me: { id: string; handle: string; payHandle?: string | null; isAdult?: boolean };
  moneyEnabled?: boolean;
  origin: string;
}) {
  const joinUrl = `${origin}/grupos?join=${group.invite_code}`;
  const recapUrl = `${origin}/api/g/${group.id}/recap?c=${group.invite_code}&u=${encodeURIComponent(me.handle)}`;
  const storyUrl = `${recapUrl}&format=story`;
  const qr = qrSvg(joinUrl);
  const top = [...rows].sort((a, b) => b.skill_7d - a.skill_7d || b.skill_total - a.skill_total).slice(0, 5);

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={26} word={18} />
        <Link href="/grupos" className="mono text-[11px] text-[var(--muted)]">{t("grupo.back")}</Link>
      </header>

      {/* nombre + racha de grupo */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 truncate text-2xl font-black">{group.name}</h1>
          <span className="mono shrink-0 rounded-full border px-2 py-0.5 text-[12px] font-black"
            title={streak > 0 ? t("grupo.streakHint", { n: String(streak) }) : t("grupo.streakZero")}
            style={{ borderColor: streak > 0 ? "var(--gold)" : "var(--line)", color: streak > 0 ? "var(--gold)" : "var(--muted)" }}>
            {t("grupo.streakChip", { n: String(streak) })}
          </span>
        </div>
        <p className="text-[11px] text-[var(--muted)]">
          {streak > 0 ? t("grupo.streakHint", { n: String(streak) }) : t("grupo.streakZero")}
        </p>
      </div>

      <GroupJudge groupId={group.id} judgeId={group.judge_id} adminId={group.created_by} myId={me.id}
        members={rows.map((r) => ({ user_id: r.user_id, handle: r.handle }))} />

      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("grupo.standings")}</p>
      <GroupLeaderboard rows={rows} myId={me.id} cutoffIso={cutoffIso} />

      <GroupShare
        code={group.invite_code}
        name={group.name}
        rows={top.map((r) => ({ handle: r.handle, score: r.skill_7d > 0 ? r.skill_7d : r.skill_total }))}
        url={joinUrl}
        recapUrl={recapUrl}
        storyUrl={storyUrl}
      />

      {moneyEnabled && <GroupMoney groupId={group.id} myId={me.id} myPayHandle={me.payHandle ?? null} canCreate={me.isAdult ?? false} />}

      {/* QR del enlace de invitación: grupos presenciales (boda, bar) */}
      <section className="flex flex-col items-center gap-2 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("grupo.qrTitle")}</p>
        <svg viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} width={180} height={180} role="img"
          aria-label={t("grupo.qrTitle")} shapeRendering="crispEdges" className="rounded-[10px]">
          <rect x={-4} y={-4} width={qr.size + 8} height={qr.size + 8} fill="#f4f1e9" />
          <path d={qr.path} fill="#0c1011" />
        </svg>
        <p className="mono text-[12px] font-black text-[var(--cream)]">{t("grupo.qrCode", { code: group.invite_code })}</p>
        <p className="text-center text-[11px] text-[var(--muted)]">{t("grupo.qrHint")}</p>
      </section>

      <AppNav />
    </main>
  );
}
