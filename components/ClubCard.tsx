"use client";
import { useState } from "react";
import { t } from "@/lib/i18n";

// Vinko Club (VINKO_BILLING_SPEC A): suscripción por tarjeta/PayPal vía Stripe.
// No da Vinkos ni ventaja (regla de oro 2): solo extras. El pago ocurre en Stripe.
const eur = (cents: number, cur: string) => new Intl.NumberFormat("es-ES", { style: "currency", currency: cur }).format(cents / 100);

const PERKS = ["no_ads", "cosmetics", "stats", "more_groups", "focus_monthly"] as const;

export function ClubCard({ active, monthly, annual, currency, configured }: {
  active: boolean; monthly: number; annual: number; currency: string; configured: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  async function go(plan: "monthly" | "annual" | "portal") {
    setBusy(plan); setErr(false);
    try {
      const path = plan === "portal" ? "/api/club/portal" : "/api/club/checkout";
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
      const j = await res.json().catch(() => ({}));
      if (j?.url) { window.location.href = j.url; return; }
      setErr(true);
    } catch { setErr(true); }
    setBusy(null);
  }

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-[var(--gold)]/50 bg-gradient-to-b from-[var(--gold)]/10 to-[var(--ink2)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[16px] font-black text-[var(--cream)]">✨ {t("club.title")}</p>
        {active && <span className="rounded-full bg-[var(--win)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">{t("club.active")}</span>}
      </div>
      <p className="text-[13px] leading-snug text-[var(--muted)]">{t("club.tagline")}</p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-[var(--cream)]">
        {PERKS.map((p) => <li key={p} className="flex items-center gap-1.5"><span className="text-[var(--win)]">✓</span>{t(`club.perk.${p}`)}</li>)}
      </ul>

      {active ? (
        <button type="button" onClick={() => go("portal")} disabled={!!busy}
          className="rounded-[12px] border border-[var(--line)] px-4 py-3 text-[14px] font-bold text-[var(--cream)] disabled:opacity-50">
          {t("club.manage")}
        </button>
      ) : configured ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => go("monthly")} disabled={!!busy}
            className="flex-1 rounded-[12px] border border-[var(--line)] px-3 py-3 text-[13px] font-black text-[var(--cream)] disabled:opacity-50">
            {t("club.monthly", { price: eur(monthly, currency) })}
          </button>
          <button type="button" onClick={() => go("annual")} disabled={!!busy}
            className="flex-1 rounded-[12px] bg-[var(--win)] px-3 py-3 text-[13px] font-black text-[var(--ink)] disabled:opacity-50">
            {t("club.annual", { price: eur(annual, currency) })}
          </button>
        </div>
      ) : (
        <p className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-center text-[12px] font-bold text-[var(--muted)]">{t("club.soon")}</p>
      )}

      {err && <p className="text-center text-[12px] text-[var(--red)]">{t("club.err")}</p>}
      <p className="text-[11px] italic leading-snug text-[var(--muted)]">{t("club.note")}</p>
    </section>
  );
}
