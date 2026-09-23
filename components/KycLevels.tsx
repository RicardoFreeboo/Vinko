"use client";
import { useState } from "react";
import { t } from "@/lib/i18n";

// KYC por niveles (§5.7). Fase 0: arquitectura y pantallas; la verificación real
// de identidad y la decisión de habilitar juego las hace el operador/proveedor.
// El formulario es una VISTA PREVIA del proceso: no guarda ni envía datos reales
// (el acuerdo Luckia §7 prohíbe documentos de identidad reales en Fase 0).
const LEVELS = [0, 1, 2, 3] as const;
const input = "w-full rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-[14px] text-[var(--cream)] outline-none focus:border-[var(--win)]";
const label = "mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]";

function VerifyForm({ level, onClose }: { level: number; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  function submit() {
    // Fase 0: NO se persiste ni se envía nada. Solo se simula el paso a revisión.
    setBusy(true);
    setTimeout(() => { setBusy(false); setSent(true); }, 700);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[20px] border-t border-[var(--line)] bg-[var(--ink)] p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-black text-[var(--cream)]">{t("kyc.form.title", { n: String(level) })}</p>

        {sent ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="rounded-[12px] border border-[var(--win)]/40 bg-[rgba(31,224,122,0.08)] px-4 py-3 text-[13px] text-[var(--win)]">
              {t("kyc.form.review")}
            </p>
            <button onClick={onClose} className="rounded-[12px] bg-[var(--win)] px-4 py-3 text-[14px] font-black text-[var(--ink)]">{t("cartera.back")}</button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {level >= 2 && (
              <>
                <div className="flex flex-col gap-1"><span className={label}>{t("kyc.form.name")}</span><input className={input} placeholder="Ricardo Cano García" /></div>
                <div className="flex flex-col gap-1"><span className={label}>{t("kyc.form.dni")}</span><input className={input} placeholder="00000000X" /></div>
                <div className="flex flex-col gap-1"><span className={label}>{t("kyc.form.dob")}</span><input className={input} type="date" /></div>
              </>
            )}
            {level >= 3 && (
              <>
                <div className="flex flex-col gap-1">
                  <span className={label}>{t("kyc.form.doc")}</span>
                  <input className={input} type="file" accept="image/*" />
                  <span className="text-[11px] text-[var(--muted2)]">{t("kyc.form.docHint")}</span>
                </div>
                <div className="flex flex-col gap-1"><span className={label}>{t("kyc.form.iban")}</span><input className={`${input} mono`} placeholder="ES00 0000 0000 0000 0000 0000" /></div>
              </>
            )}
            <p className="text-[11px] leading-snug text-[var(--muted2)]">{t("kyc.form.demoNote")}</p>
            <div className="flex gap-2">
              <button onClick={submit} disabled={busy} className="flex-1 rounded-[12px] bg-[var(--win)] px-4 py-3 text-[14px] font-black text-[var(--ink)] disabled:opacity-50">
                {busy ? t("kyc.form.sending") : t("kyc.form.submit")}
              </button>
              <button onClick={onClose} className="rounded-[12px] border border-[var(--line)] px-4 text-[14px] font-bold text-[var(--muted)]">{t("kyc.form.cancel")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function KycLevels({ current }: { current: number }) {
  const [verifying, setVerifying] = useState<number | null>(null);
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
                <button onClick={() => setVerifying(n)}
                  className="rounded-[12px] bg-[var(--win)] px-4 py-2.5 text-[14px] font-black text-[var(--ink)]">
                  {t("kyc.verify")}
                </button>
              </div>
            )}
          </section>
        );
      })}
      {verifying != null && <VerifyForm level={verifying} onClose={() => setVerifying(null)} />}
    </div>
  );
}
