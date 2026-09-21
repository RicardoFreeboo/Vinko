"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { WeekStreak } from "@/components/WeekStreak";
import { t } from "@/lib/i18n";

// Cabecera de la pestaña VINKOS: la racha semanal (días L-D con fuego y el
// premio al final), el regalo diario (claim_daily_bonus) y el NIVEL real
// calculado del XP del perfil.

// Nivel n = XP acumulado 100·n·(n-1)/2 → L1 0 · L2 100 · L3 300 · L4 600 · L5 1000…
export function levelReq(n: number): number { return (100 * n * (n - 1)) / 2; }
export function levelFromXp(xp: number): { level: number; from: number; to: number; pct: number } {
  const x = Math.max(0, Math.floor(xp));
  let n = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * x) / 100)) / 2));
  while (levelReq(n + 1) <= x) n++;
  while (n > 1 && levelReq(n) > x) n--;
  const from = levelReq(n), to = levelReq(n + 1);
  return { level: n, from, to, pct: Math.min(100, Math.round(((x - from) / (to - from)) * 100)) };
}

export function LevelCard({ xp }: { xp: number }) {
  const { level, to, pct } = levelFromXp(xp);
  return (
    <section className="rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4">
      <div className="flex items-end justify-between">
        <div className="text-xl font-black text-[var(--gold)]">▲ {t("level.title", { n: String(level) })}</div>
        <div className="mono text-xs text-[var(--muted)]">{t("level.xp", { xp: String(Math.max(0, xp)) })}</div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--ink3)]" role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-[var(--muted)]">
        <span className="mono">{pct}%</span>
        <span>{t("level.next", { n: String(Math.max(0, to - Math.max(0, xp))), next: String(level + 1) })}</span>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-[var(--muted2)]">{t("level.hint")}</p>
    </section>
  );
}

export function VinkosStreak({
  streakDays, streakBest, shields, streakLast = null, prizePts = 500, today,
  bonusClaimedToday, bonusStep, bonusPts, bonusTotal = 7, xp = 0,
}: {
  streakDays: number; streakBest: number; shields: number;
  streakLast?: string | null; prizePts?: number; today?: string;
  bonusClaimedToday: boolean;
  bonusStep: number;      // día que se cobra al pulsar (1..bonusTotal)
  bonusPts?: number;      // Vinkos de ese día (escalera cfg economy.daily_bonus)
  bonusTotal?: number;
  xp?: number;
}) {
  const router = useRouter();
  const [bonusMsg, setBonusMsg] = useState<string | null>(null);
  const [bonusDone, setBonusDone] = useState(bonusClaimedToday);

  async function claimBonus() {
    const sb = supabaseBrowser();
    if (!sb || bonusDone) return;
    const { data, error } = await sb.rpc("claim_daily_bonus");
    if (!error) {
      setBonusDone(true);
      if ((data ?? 0) > 0) setBonusMsg(t("hoy.bonusGot", { n: String(data) }));
      router.refresh();
    }
  }

  return (
    <>
      <WeekStreak streakDays={streakDays} streakBest={streakBest} shields={shields}
        streakLast={streakLast} prizePts={prizePts} today={today} />
      {!bonusDone ? (
        <button onClick={claimBonus}
          className="rounded-[14px] bg-[var(--win)] px-4 py-3.5 text-[15px] font-black text-[var(--ink)]">
          {bonusPts
            ? t("vinkos.bonusCta", { pts: String(bonusPts), n: String(bonusStep), total: String(bonusTotal) })
            : t("hoy.bonusCta", { n: String(bonusStep) })}
        </button>
      ) : bonusMsg ? (
        <p className="text-center text-sm font-bold text-[var(--win)]">{bonusMsg}</p>
      ) : null}
      <LevelCard xp={xp} />
    </>
  );
}
