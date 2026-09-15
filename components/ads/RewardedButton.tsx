"use client";
import { useState } from "react";
import { ADS_ENABLED, LEGAL_LOCK, REWARD_AMOUNT } from "@/lib/ads";
import { t } from "@/lib/i18n";

// RewardedAdapter (PASO 6c). Se muestra SOLO con sesión +18 y LEGAL_LOCK=false.
// El proveedor real es Google Ad Manager (GPT rewarded) — AdSense NO hace
// rewarded. Con ADS_ENABLED=false corre el stub de test (overlay ~3s → completed).
// El crédito (+10) lo hace SIEMPRE el servidor (POST /rewards/claim → Edge
// Function): el cliente nunca suma puntos. Aquí solo se dispara el flujo.
export function RewardedButton({
  isAdult,
  onClaimed,
}: {
  isAdult: boolean;
  onClaimed?: (impressionId: string) => void;
}) {
  const [watching, setWatching] = useState(false);
  const [left, setLeft] = useState(3);

  // Regla del freeze: oculto en público mientras dure el candado legal.
  if (LEGAL_LOCK || !isAdult) return null;

  async function watch() {
    setWatching(true);
    // Stub de test cuando no hay proveedor (ADS_ENABLED=false). Con Ad Manager
    // aquí iría el rewarded real (googletag rewardedSlot).
    for (let s = 3; s > 0; s--) {
      setLeft(s);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setWatching(false);
    const impressionId = crypto.randomUUID();
    // El crédito real lo valida el servidor; aquí solo avisamos.
    onClaimed?.(impressionId);
  }

  return (
    <button
      onClick={watch}
      disabled={watching}
      className="flex w-full flex-col items-center gap-0.5 rounded-[14px] border border-[var(--gold)] px-4 py-3 text-center"
    >
      <span className="text-[15px] font-bold text-[var(--gold)]">
        {watching ? t("ad.watching", { s: String(left) }) : t("ad.rewarded.cta", { n: String(REWARD_AMOUNT) })}
      </span>
      <span className="text-[11px] text-[var(--muted)]">{t("ad.rewarded.note")}</span>
      {!ADS_ENABLED && (
        <span className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted2)]">{t("ad.stub")}</span>
      )}
    </button>
  );
}
