"use client";
import { useState } from "react";
import { t } from "@/lib/i18n";

// KYC por niveles (§5.7). Fase 0: arquitectura y pantallas; la verificación real
// de identidad y la decisión de habilitar juego las hace el operador/proveedor.
// Aquí NO se captura ningún documento real: solo se explica y se enruta.
const LEVELS = [0, 1, 2, 3] as const;

export function KycLevels({ current }: { current: number }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-[12px] border border-[var(--gold)]/40 bg-[var(--ink2)] px-4 py-2.5 text-[13px] font-bold text-[var(--gold)]">
        {t("kyc.current", { n: String(current) })}
      </p>
      {LEVELS.map((n) => {
        const state = current >= n ? "done" : current === n - 1 ? "next" : "locked";
        return (
          <section key={n} className="rounded-[16px] border p-4"
            style={{ borderColor: state === "next" ? "var(--win)" : "var(--line)", background: "var(--ink2)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-[var(--cream)]">{t(`kyc.l${n}.title`)}</span>
              <span className="mono shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black"
                style={{
                  borderColor: state === "done" ? "var(--win)" : state === "next" ? "var(--gold)" : "var(--line)",
                  color: state === "done" ? "var(--win)" : state === "next" ? "var(--gold)" : "var(--muted)",
                }}>
                {state === "done" ? `✓ ${t("kyc.done")}` : t("kyc.locked")}
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-1 text-[12px]">
              <div className="flex gap-2"><span className="w-20 shrink-0 text-[var(--muted2)]">{t("kyc.need")}</span><span className="text-[var(--cream)]">{t(`kyc.l${n}.need`)}</span></div>
              <div className="flex gap-2"><span className="w-20 shrink-0 text-[var(--muted2)]">{t("kyc.unlock")}</span><span className="text-[var(--cream)]">{t(`kyc.l${n}.unlock`)}</span></div>
            </div>
            {state === "next" && n >= 2 && (
              <div className="mt-3">
                <p className="mb-2 text-[11px] text-[var(--muted)]">{t("kyc.why")}</p>
                <button onClick={() => setMsg(t("kyc.off"))}
                  className="rounded-[12px] bg-[var(--win)] px-4 py-2.5 text-[14px] font-black text-[var(--ink)]">
                  {t("kyc.verify")}
                </button>
              </div>
            )}
          </section>
        );
      })}
      {msg && <p className="text-center text-[12px] text-[var(--muted)]">{msg}</p>}
    </div>
  );
}
