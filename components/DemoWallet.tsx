"use client";
import { useState } from "react";
import { VinkoCoin } from "@/components/VinkoCoin";
import { t } from "@/lib/i18n";

// Demo del modo dinero (SIMULACIÓN), solo visible para admin en /saldo. Toggle
// puntos/dinero + paneles de ingresar y retirar con cantidad libre. Números
// falsos, sin dinero real: es la maqueta del modelo con partner licenciado para
// enseñar en el pitch (como el «modo $» de la APK). No mueve nada ni escribe en BD.
const eur = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

const DEP_METHODS = ["Bizum", "Tarjeta", "PayPal"];
const WD_METHODS = ["Bizum", "IBAN", "PayPal"];

export function DemoWallet({ points }: { points: number }) {
  const [mode, setMode] = useState<"points" | "money">("points");
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [balance, setBalance] = useState(2500); // 25,00 € falsos
  const [amount, setAmount] = useState(1000); // 10,00 €
  const [method, setMethod] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const methods = tab === "deposit" ? DEP_METHODS : WD_METHODS;
  const amtCents = Math.max(100, Math.min(50000, Math.round(amount)));

  function confirm() {
    if (tab === "deposit") {
      setBalance((b) => b + amtCents);
      setToast(t("demo.wallet.doneDeposit", { amount: eur(amtCents) }));
    } else {
      setBalance((b) => Math.max(0, b - amtCents));
      setToast(t("demo.wallet.doneWithdraw", { amount: eur(amtCents) }));
    }
    setTimeout(() => setToast(null), 2500);
  }

  const pill = (on: boolean) =>
    `flex-1 rounded-full px-3 py-2 text-[13px] font-black transition ${on ? "bg-[var(--win)] text-[var(--ink)]" : "text-[var(--muted)]"}`;

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-[var(--gold)]/50 bg-[var(--ink2)] p-4">
      <div className="flex items-center justify-end">
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">{t("demo.wallet.badge")}</span>
      </div>

      {/* Toggle puntos / dinero */}
      <div className="flex gap-1 rounded-full border border-[var(--line)] p-1">
        <button type="button" onClick={() => setMode("points")} className={pill(mode === "points")}>🪙 {t("demo.wallet.points")}</button>
        <button type="button" onClick={() => setMode("money")} className={pill(mode === "money")}>💶 {t("demo.wallet.money")}</button>
      </div>

      {mode === "points" ? (
        <div className="flex items-center justify-between rounded-[12px] border border-[var(--line)] px-4 py-3">
          <span className="text-[13px] text-[var(--muted)]">{t("demo.wallet.balance")}</span>
          <span className="flex items-center gap-1.5 text-[18px] font-black text-[var(--cream)]"><VinkoCoin size={16} />{points}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-[12px] border border-[var(--gold)]/40 bg-[var(--gold)]/8 px-4 py-3">
            <span className="text-[13px] text-[var(--muted)]">{t("demo.wallet.balance")}</span>
            <span className="text-[22px] font-black text-[var(--gold)]">{eur(balance)}</span>
          </div>

          {/* Ingresar / Retirar */}
          <div className="flex gap-1 rounded-full border border-[var(--line)] p-1">
            <button type="button" onClick={() => setTab("deposit")} className={pill(tab === "deposit")}>↓ {t("demo.wallet.deposit")}</button>
            <button type="button" onClick={() => setTab("withdraw")} className={pill(tab === "withdraw")}>↑ {t("demo.wallet.withdraw")}</button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">{t("demo.wallet.amount")}</span>
            <div className="flex items-center gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2">
              <input
                type="number" inputMode="decimal" min={1} max={500} value={amount / 100}
                onChange={(e) => setAmount(Math.round(Number(e.target.value) * 100))}
                className="w-full bg-transparent text-[16px] font-black text-[var(--cream)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[14px] font-bold text-[var(--muted)]">€</span>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">{t("demo.wallet.method")}</span>
            <div className="flex gap-1.5">
              {methods.map((m, i) => (
                <button key={m} type="button" onClick={() => setMethod(i)}
                  className={`flex-1 rounded-[10px] border px-2 py-2 text-[12px] font-bold ${method === i ? "border-[var(--win)] text-[var(--cream)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
                  {m}
                </button>
              ))}
            </div>
          </label>

          <button type="button" onClick={confirm}
            className="rounded-[12px] bg-[var(--win)] px-4 py-3 text-[14px] font-black text-[var(--ink)]">
            {tab === "deposit" ? t("demo.wallet.confirmDeposit") : t("demo.wallet.confirmWithdraw")}
          </button>

          {toast && <p className="rounded-[10px] bg-[var(--win)]/15 px-3 py-2 text-center text-[13px] font-bold text-[var(--win)]">✓ {toast}</p>}

        </>
      )}
    </section>
  );
}
