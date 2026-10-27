"use client";
// Ajustes → «Tus anuncios» (Vinko Ads, Fase 2, spec §14): «Anuncios según mis
// intereses». Se guarda con ads_set_preferences (0072); la identidad sale de la
// sesión, nunca del cliente. Mismo interruptor que el de analítica en
// AjustesClient. «No ver publicidad de juego» no se muestra: no hay publicidad
// de operadores de juego (REGLAS-LEGALES R5).
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

export function AdsPreferences({ personalized: initial }: { personalized: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function toggle() {
    const sb = supabaseBrowser();
    if (!sb || busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    setErr(false);
    const { data, error } = await sb.rpc("ads_set_preferences", { p_personalized: next });
    setBusy(false);
    if (error || !data) {
      setOn(!next);
      setErr(true);
      return;
    }
    setOn(data.personalized !== false);
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4">
      <h2 className="text-[15px] font-black text-[var(--cream)]">{t("ajustes.ads.title")}</h2>
      <p className="text-[12px] leading-snug text-[var(--muted)]">{t("ajustes.ads.lead")}</p>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t("ajustes.ads.personal")}
        disabled={busy}
        onClick={toggle}
        className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--ink3)] px-4 py-3 text-left"
      >
        <span className="text-[13px] font-bold text-[var(--cream)]">{t("ajustes.ads.personal")}</span>
        <span
          aria-hidden
          className={`relative h-6 w-11 flex-none rounded-full transition-colors ${on ? "bg-[var(--win)]" : "bg-[var(--muted2)]"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--cream)] transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`}
          />
        </span>
      </button>
      <p className="px-1 text-[11px] leading-snug text-[var(--muted2)]">{t("ajustes.ads.personalD")}</p>
      <div className="rounded-[12px] border border-[var(--line)] px-3 py-2.5">
        <p className="text-[12px] font-bold text-[var(--cream)]">{t("ajustes.ads.why")}</p>
        <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
          {t("ajustes.ads.whyLead")} «{t("ajustes.ads.whyExample")}»
        </p>
      </div>
      <p className="text-[11px] leading-snug text-[var(--muted2)]">{t("ajustes.ads.never")}</p>
      {err && (
        <p role="alert" className="text-[12px] font-bold text-[var(--red)]">
          {t("ajustes.ads.err")}
        </p>
      )}
    </section>
  );
}
