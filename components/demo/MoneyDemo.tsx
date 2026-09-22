"use client";
import { useState } from "react";
import { t } from "@/lib/i18n";

// Demo de inversor (SIMULACIÓN): recorre el flujo de una bolsa de dinero con
// números falsos, resaltando la comisión de Vinko. No toca la base de datos ni
// mueve dinero. Etiquetada como maqueta del modelo con partner licenciado.

const CURRENCY = "EUR";
const eur = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: CURRENCY }).format(cents / 100);
const pct = (bps: number) => `${(bps / 100).toFixed(0)}%`;

// Economía de la bolsa (parimutuel, misma fórmula que resolve_porra):
const STAKE = 500; // 5,00 €
const PARTICIPANTS = 20;
const RAKE_BPS = 500; // 5%
const WINNERS = 8;
const POT = STAKE * PARTICIPANTS; // 10.000 c = 100 €
const COMMISSION = Math.floor((POT * RAKE_BPS) / 10000); // 500 c = 5 €
const DISTRIBUTABLE = POT - COMMISSION; // 9.500 c
const WIN_STAKE = STAKE * WINNERS; // 4.000 c
const PER_WINNER = Math.floor((STAKE * DISTRIBUTABLE) / WIN_STAKE); // floor(500*9500/4000)=1187 c

const TOTAL_STEPS = 5;
const OPTIONS = ["demo.opt.madrid", "demo.opt.barca", "demo.opt.empate"] as const;

const card = "rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4";
const row = "flex items-center justify-between py-1.5 text-sm";

export function MoneyDemo() {
  const [step, setStep] = useState(1);
  const [pick, setPick] = useState(0);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-3 px-4 pb-24 pt-3">
      {/* Banner SIMULACIÓN, siempre visible */}
      <div className="rounded-[14px] border border-[var(--gold)]/60 bg-[var(--gold)]/10 px-3 py-2 text-center">
        <p className="text-[13px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">{t("demo.badge")}</p>
        <p className="mt-0.5 text-[11px] leading-tight text-[var(--muted)]">{t("demo.badge.sub")}</p>
      </div>

      <div className="flex items-center justify-between px-1">
        <h1 className="text-[18px] font-black text-[var(--cream)]">{t("demo.title")}</h1>
        <span className="text-[11px] font-bold text-[var(--muted)]">{t("demo.step", { n: String(step), total: String(TOTAL_STEPS) })}</span>
      </div>

      {/* La porra */}
      <div className={card}>
        <p className="text-[15px] font-black text-[var(--cream)]">⚽ {t("demo.q")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {OPTIONS.map((o, i) => {
            const chosen = step >= 2 && pick === i;
            const isWinner = step >= 4 && i === 0;
            return (
              <button
                key={o}
                type="button"
                disabled={step !== 2}
                onClick={() => setPick(i)}
                className={`flex items-center justify-between rounded-[12px] border px-3.5 py-3 text-left text-[14px] font-bold transition ${
                  isWinner
                    ? "border-[var(--win)] bg-[var(--win)]/15 text-[var(--cream)]"
                    : chosen
                      ? "border-[var(--win)] text-[var(--cream)]"
                      : "border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                <span>{t(o)}</span>
                <span className="text-[12px]">
                  {isWinner ? "✅" : chosen ? "●" : ""}
                </span>
              </button>
            );
          })}
        </div>
        <div className={`${row} mt-2 border-t border-[var(--line)] pt-2`}>
          <span className="text-[var(--muted)]">{t("demo.entry")}</span>
          <span className="font-black text-[var(--cream)]">{eur(STAKE)}</span>
        </div>
      </div>

      {/* Paso 1 — elegibilidad */}
      {step >= 1 && (
        <div className={card}>
          <p className="text-[13px] font-black text-[var(--cream)]">{t("demo.s1.title")}</p>
          <p className="mt-1 text-[14px] font-bold text-[var(--win)]">✓ {t("demo.s1.ok")}</p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">{t("demo.s1.detail")}</p>
          <p className="mt-2 text-[11px] italic text-[var(--muted)]">{t("demo.s1.note")}</p>
        </div>
      )}

      {/* Paso 2 — elige y paga */}
      {step >= 2 && (
        <div className={card}>
          <p className="text-[13px] font-black text-[var(--cream)]">{t("demo.s2.title")}</p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">{t("demo.s2.pick")}: <span className="font-bold text-[var(--cream)]">{t(OPTIONS[pick])}</span></p>
          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-3 w-full rounded-full bg-[var(--win)] px-4 py-3 text-[14px] font-black text-[var(--ink)]"
            >
              {t("demo.s2.pay", { amount: eur(STAKE) })}
            </button>
          )}
          <p className="mt-2 text-[11px] italic text-[var(--muted)]">{t("demo.s2.note")}</p>
        </div>
      )}

      {/* Paso 3 — confirmada + bolsa */}
      {step >= 3 && (
        <div className={card}>
          <p className="text-[13px] font-black text-[var(--cream)]">{t("demo.s3.title")}</p>
          <p className="mt-1 text-[14px] font-bold text-[var(--win)]">✓ {t("demo.s3.ok", { amount: eur(STAKE) })}</p>
          <div className="mt-2 border-t border-[var(--line)] pt-2">
            <div className={row}><span className="text-[var(--muted)]">{t("demo.s3.participants")}</span><span className="font-black text-[var(--cream)]">{PARTICIPANTS}</span></div>
            <div className={row}><span className="text-[var(--muted)]">{t("demo.s3.pot")}</span><span className="font-black text-[var(--cream)]">{eur(POT)}</span></div>
          </div>
        </div>
      )}

      {/* Paso 4 — resultado oficial */}
      {step >= 4 && (
        <div className={card}>
          <p className="text-[13px] font-black text-[var(--cream)]">{t("demo.s4.title")}</p>
          <p className="mt-1 text-[15px] font-black text-[var(--cream)]">🏆 {t("demo.s4.result")}</p>
          <div className={`${row} border-t border-[var(--line)] pt-2`}><span className="text-[var(--muted)]">{t("demo.s4.winners")}</span><span className="font-black text-[var(--cream)]">{WINNERS}</span></div>
          <p className="mt-1 text-[11px] italic text-[var(--muted)]">{t("demo.s4.note")}</p>
        </div>
      )}

      {/* Paso 5 — liquidación + comisión */}
      {step >= 5 && (
        <>
          <div className={card}>
            <p className="text-[13px] font-black text-[var(--cream)]">{t("demo.s5.title")}</p>
            <div className="mt-2">
              <div className={row}><span className="text-[var(--muted)]">{t("demo.s5.pot")}</span><span className="font-bold text-[var(--cream)]">{eur(POT)}</span></div>
              <div className={row}><span className="text-[var(--gold)]">− {t("demo.s5.commission", { pct: pct(RAKE_BPS) })}</span><span className="font-black text-[var(--gold)]">{eur(COMMISSION)}</span></div>
              <div className={`${row} border-t border-[var(--line)] pt-2`}><span className="text-[var(--muted)]">{t("demo.s5.distributable")}</span><span className="font-bold text-[var(--cream)]">{eur(DISTRIBUTABLE)}</span></div>
              <div className={row}><span className="text-[var(--muted)]">{t("demo.s5.winners")}</span><span className="font-bold text-[var(--cream)]">{WINNERS}</span></div>
              <div className={row}><span className="text-[var(--win)]">{t("demo.s5.perWinner")}</span><span className="font-black text-[var(--win)]">{eur(PER_WINNER)}</span></div>
            </div>
            <p className="mt-2 text-[11px] italic text-[var(--muted)]">{t("demo.s5.paidBy")}</p>
          </div>

          {/* Lo que gana Vinko — resaltado */}
          <div className="rounded-[16px] border border-[var(--gold)] bg-[var(--gold)]/12 p-4">
            <p className="text-[12px] font-black uppercase tracking-[0.14em] text-[var(--gold)]">💰 {t("demo.commission.title")}</p>
            <p className="mt-1 text-[28px] font-black leading-none text-[var(--gold)]">{t("demo.commission.amount", { amount: eur(COMMISSION) })}</p>
            <p className="mt-2 text-[12px] leading-snug text-[var(--cream)]">{t("demo.commission.note")}</p>
          </div>
        </>
      )}

      {/* Controles */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[430px] border-t border-[var(--line)] bg-[var(--ink)]/95 px-4 py-3 backdrop-blur">
        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
            className="w-full rounded-full bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]"
          >
            {t("demo.next")} →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { setStep(1); setPick(0); }}
            className="w-full rounded-full border border-[var(--line)] px-5 py-3 text-[15px] font-bold text-[var(--muted)]"
          >
            ↺ {t("demo.restart")}
          </button>
        )}
        <p className="mt-2 text-center text-[10px] text-[var(--muted)]">{t("demo.footer")}</p>
      </div>
    </div>
  );
}
