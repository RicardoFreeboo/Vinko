"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { RewardedSlot, type SlotId } from "@/components/ads/RewardedSlot";
import { t } from "@/lib/i18n";

// Monedas (PTS) · Nivel (XP) · Puntería (marcador) — nunca se mezclan (§3.1).
// Recarga = goteo (claim_drip). Anuncios recompensados: R2 monedas, R3 escudo,
// R1 rescatar racha, R6 dobla Nivel — crédito SIEMPRE por servidor, jamás
// tocan la Puntería (§0.2).
const DIVISIONS: Record<string, string> = {
  bronce: "Bronce", plata: "Plata", oro: "Oro", diamante: "Diamante", leyenda: "Leyenda",
};

export function SaldoClient({
  initialPoints, xp, marcador, division, shields, isAdult, recoverable, brokenDays,
}: {
  initialPoints: number;
  xp: number;
  marcador: number;
  division: string;
  shields: number;
  isAdult: boolean;
  recoverable: boolean;
  brokenDays: number;
}) {
  const router = useRouter();
  const [points, setPoints] = useState(initialPoints);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function recharge() {
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data, error } = await sb.rpc("claim_drip");
    if (!error && (data ?? 0) > 0) {
      setPoints((p) => p + data);
      setMsg({ kind: "ok", text: t("saldo.rechargeGot", { n: String(data) }) });
    } else if (!error) {
      setMsg({ kind: "ok", text: t("saldo.rechargeNone") });
    }
    router.refresh();
  }

  function onGranted(slot: SlotId, g: { granted: number; reward?: string; value?: number }) {
    if (slot === "R2" && g.reward === "pts") {
      setPoints((p) => p + (g.value ?? 0));
      setMsg({ kind: "ok", text: t("saldo.granted", { n: String(g.value ?? 0) }) });
    } else if (g.reward === "shield") {
      setMsg({ kind: "ok", text: t("saldo.rewardShield") });
    } else if (g.reward === "streak_recover") {
      setMsg({ kind: "ok", text: t("saldo.rewardRecover") });
    } else if (g.reward === "xp") {
      setMsg({ kind: "ok", text: t("saldo.rewardXp", { n: String(g.value ?? 25) }) });
    } else {
      setMsg({ kind: "ok", text: t("saldo.rewardGeneric") });
    }
    router.refresh();
  }

  function onError(code: string) {
    if (code.includes("VINKO_AD_CAP")) setMsg({ kind: "err", text: t("saldo.cap") });
    else if (code === "duplicate") setMsg({ kind: "ok", text: t("saldo.already") });
    else setMsg({ kind: "err", text: t("saldo.error") });
  }

  return (
    <>
      {/* tres monedas, tres trabajos distintos */}
      <div className="grid grid-cols-3 gap-2">
        <Stat value={points} label={t("saldo.coins")} icon="🪙" color="var(--win)" />
        <Stat value={xp} label={t("saldo.level")} icon="▲" color="var(--gold)" />
        <Stat value={marcador} label={t("saldo.skill")} icon="🎯" color="var(--cream)" />
      </div>
      <div className="flex items-center justify-between rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-2.5">
        <span className="text-xs text-[var(--muted)]">{t("saldo.division")}</span>
        <span className="text-sm font-black text-[var(--gold)]">{DIVISIONS[division] ?? division}</span>
      </div>

      <button
        onClick={recharge}
        className="rounded-[14px] bg-[var(--win)] px-4 py-3.5 text-[15px] font-black text-[var(--ink)]"
      >
        {t("saldo.recharge")}
      </button>

      {isAdult && (
        <section className="flex flex-col gap-2">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {t("saldo.earn")}
          </p>
          {recoverable && (
            <RewardedSlot slot="R1" cta={t("saldo.r1", { n: String(brokenDays) })}
              note={t("saldo.adNote")} onGranted={(g) => onGranted("R1", g)} onError={onError} />
          )}
          <RewardedSlot slot="R2" cta={t("saldo.r2", { n: "200" })}
            note={t("saldo.adNote")} onGranted={(g) => onGranted("R2", g)} onError={onError} />
          {shields < 2 && (
            <RewardedSlot slot="R3" cta={t("saldo.r3")}
              note={t("saldo.adNote")} onGranted={(g) => onGranted("R3", g)} onError={onError} />
          )}
          <RewardedSlot slot="R6" cta={t("saldo.r6")}
            note={t("saldo.adNote")} onGranted={(g) => onGranted("R6", g)} onError={onError} />
        </section>
      )}
      {!isAdult && (
        <p className="text-center text-xs text-[var(--muted)]">{t("saldo.adultOnly")}</p>
      )}

      {msg && (
        <p className={`text-center text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>
          {msg.text}
        </p>
      )}
    </>
  );
}

function Stat({ value, label, icon, color }: { value: number; label: string; icon: string; color: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] p-3 text-center">
      <div className="mono text-xl font-black" style={{ color }}>{icon} {value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
    </div>
  );
}
