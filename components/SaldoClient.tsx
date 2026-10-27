"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { RewardedSlot, type SlotId } from "@/components/ads/RewardedSlot";
import { t } from "@/lib/i18n";

// Acciones de /saldo: recoger el goteo (claim_drip) y los anuncios
// recompensados (R2 Vinkos, R3 escudo, R1 rescatar racha). El crédito lo hace
// SIEMPRE el servidor; aquí solo se pide y se refresca la página (el saldo de
// arriba lo pinta el servidor). Los anuncios dan Vinkos o escudo, JAMÁS
// Puntería (§0.2). Sin disclaimers de dinero más allá del obligatorio.
export function SaldoClient({
  adPts, isAdult, shields, recoverable, brokenDays,
}: {
  adPts: number; isAdult: boolean; shields: number; recoverable: boolean; brokenDays: number;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function recharge() {
    const sb = supabaseBrowser();
    if (!sb || busy) return;
    setBusy(true);
    const { data, error } = await sb.rpc("claim_drip");
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: t("saldo.error") }); return; }
    setMsg({ kind: "ok", text: (data ?? 0) > 0 ? t("saldo.rechargeGot", { n: String(data) }) : t("saldo.rechargeNone") });
    router.refresh();
  }

  function onGranted(slot: SlotId, g: { granted: number; reward?: string; value?: number }) {
    if (slot === "R2" && g.reward === "pts") setMsg({ kind: "ok", text: t("saldo.granted", { n: String(g.value ?? 0) }) });
    else if (g.reward === "shield") setMsg({ kind: "ok", text: t("saldo.rewardShield") });
    else if (g.reward === "streak_recover") setMsg({ kind: "ok", text: t("saldo.rewardRecover") });
    else setMsg({ kind: "ok", text: t("saldo.rewardGeneric") });
    router.refresh();
  }
  function onError(code: string) {
    if (code.includes("VINKO_AD_CAP")) setMsg({ kind: "err", text: t("saldo.cap") });
    else if (code === "duplicate") setMsg({ kind: "ok", text: t("saldo.already") });
    else setMsg({ kind: "err", text: t("saldo.error") });
  }

  return (
    <>
      {/* recarga automática (goteo), explicada — .btn.sec del diseño */}
      <button type="button" onClick={recharge} disabled={busy}
        className="flex flex-col items-center rounded-[20px] border border-[var(--line2)] bg-[var(--ink3)] px-4 py-3.5 text-center disabled:opacity-70">
        <span className="text-[16px] font-black text-[var(--cream)]">{t("saldo.recharge")}</span>
        <span className="mt-0.5 text-[12px] text-[var(--muted)]">{t("saldo.rechargeSub")}</span>
      </button>

      {/* anuncios recompensados: solo Vinkos o escudo */}
      {isAdult && (
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow text-[11px]">{t("saldo.earn")}</h2>
          <RewardedSlot slot="R2" cta={t("saldo.r2", { n: String(adPts) })}
            onGranted={(g) => onGranted("R2", g)} onError={onError} />
          {shields < 2 && (
            <RewardedSlot slot="R3" cta={t("saldo.r3")}
              onGranted={(g) => onGranted("R3", g)} onError={onError} />
          )}
          {recoverable && (
            <RewardedSlot slot="R1" cta={t("saldo.r1", { n: String(brokenDays) })}
              onGranted={(g) => onGranted("R1", g)} onError={onError} />
          )}
        </section>
      )}

      {msg && (
        <p role="status" className={`text-center text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>
          {msg.text}
        </p>
      )}
    </>
  );
}
