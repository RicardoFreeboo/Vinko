"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { WeekStreak } from "@/components/WeekStreak";
import { t } from "@/lib/i18n";

// Cabecera de la pestaña VINKOS: la racha semanal (días L-D con fuego y el
// premio al final) y el regalo diario, que es de donde salen los Vinkos.
// Antes vivían en "Hoy", que ya no existe como pestaña.
export function VinkosStreak({
  streakDays, streakBest, shields, bonusClaimedToday, bonusStep,
}: {
  streakDays: number; streakBest: number; shields: number;
  bonusClaimedToday: boolean; bonusStep: number;
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
      <WeekStreak streakDays={streakDays} streakBest={streakBest} shields={shields} />
      {!bonusDone ? (
        <button onClick={claimBonus}
          className="rounded-[14px] bg-[var(--win)] px-4 py-3.5 text-[15px] font-black text-[var(--ink)]">
          {t("hoy.bonusCta", { n: String(bonusStep + 1) })}
        </button>
      ) : bonusMsg ? (
        <p className="text-center text-sm font-bold text-[var(--win)]">{bonusMsg}</p>
      ) : null}
    </>
  );
}
