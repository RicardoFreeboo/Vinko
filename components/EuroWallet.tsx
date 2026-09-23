"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EurAmount } from "@/components/money/EurAmount";
import { t } from "@/lib/i18n";
import { depositAction, withdrawAction, type WalletActionResult } from "@/app/cartera/actions";
import type { WalletView } from "@/lib/money/wallet";

const dateEs = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(d);
};

// Cartera de EUROS (diseño frontend §5.10). Saldo y movimientos vienen del motor
// (wallet_get); la custodia es del proveedor licenciado. Sin UI optimista: el
// saldo solo cambia cuando el proveedor confirma. Apagado hoy → "aún no disponible".
const card = "rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4";
const chip = "rounded-full border px-3 py-1.5 text-[13px] font-bold";
const newKey = () => { try { return crypto.randomUUID(); } catch { return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`; } };

export function EuroWallet({ wallet, eurosEnabled, selfExcludedUntil = null }: { wallet: WalletView | null; eurosEnabled: boolean; selfExcludedUntil?: string | null }) {
  const router = useRouter();
  const available = wallet?.availableMinor ?? 0;
  const locked = wallet?.lockedMinor ?? 0;
  const movements = wallet?.movements ?? [];
  const [sheet, setSheet] = useState<null | "deposit" | "withdraw">(null);
  const [amountEur, setAmountEur] = useState("10");
  const [method, setMethod] = useState("bizum");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const minor = Math.round(parseFloat(amountEur.replace(",", ".")) * 100);
    if (!(minor >= 100 && minor <= 100000)) { setErr(t("cartera.err.generic")); return; }
    setBusy(true); setErr(null);
    const r: WalletActionResult = sheet === "deposit"
      ? await depositAction(minor, method, newKey())
      : await withdrawAction(minor, newKey());
    setBusy(false);
    if (r.ok) {
      if (r.cashierUrl) { window.location.href = r.cashierUrl; return; }
      setSheet(null); router.refresh();
      return;
    }
    setErr(t(`cartera.err.${r.code}`));
  }

  return (
    <section className={card}>
      <div className="flex items-end justify-between">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("cartera.euros")} · {t("cartera.available")}</p>
          <EurAmount cents={available} size="xl" />
          {locked > 0 && (
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">{t("cartera.locked")}: <EurAmount cents={locked} size="sm" /></p>
          )}
        </div>
      </div>

      {selfExcludedUntil ? (
        <p className="mt-2 text-[12px] leading-snug text-[var(--gold)]">{t("safer.excludedNote", { date: dateEs(selfExcludedUntil) })}</p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { setSheet("deposit"); setErr(null); }}
              className="flex-1 rounded-[12px] bg-[var(--win)] px-4 py-2.5 text-[14px] font-black text-[var(--ink)]">{t("cartera.deposit")}</button>
            <button onClick={() => { setSheet("withdraw"); setErr(null); }}
              className="flex-1 rounded-[12px] border border-[var(--line)] px-4 py-2.5 text-[14px] font-black text-[var(--cream)]">{t("cartera.withdraw")}</button>
          </div>
          {!eurosEnabled && <p className="mt-2 text-[12px] leading-snug text-[var(--muted)]">{t("cartera.eurosOff")}</p>}
        </>
      )}

      {!selfExcludedUntil && (
        <div className="mt-3 border-t border-[var(--line)] pt-3">
          <p className="mb-1.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("cartera.movements")}</p>
          {movements.length === 0 ? (
            <p className="text-[12px] text-[var(--muted)]">{t("cartera.noMovements")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {movements.slice(0, 8).map((m) => {
                const neg = m.kind === "withdraw" || m.kind === "stake_hold" || m.kind === "rake";
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate text-[var(--cream)]">{t(`cartera.movKind.${m.kind}`)}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <EurAmount cents={neg ? -m.amountMinor : m.amountMinor} size="sm" sign />
                      <span className="text-[10px] text-[var(--muted)]">{t(`cartera.movStatus.${m.status}`)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[10px] leading-snug text-[var(--muted2)]">{t("cartera.rg")}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/verificar" className="text-[11px] font-bold text-[var(--gold)] underline">{t("kyc.link")}</Link>
        <Link href="/juego-seguro" className="text-[11px] font-bold text-[var(--gold)] underline">{t("safer.link")}</Link>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={() => setSheet(null)}>
          <div className="max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[20px] border-t border-[var(--line)] bg-[var(--ink)] p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-black text-[var(--cream)]">{sheet === "deposit" ? t("cartera.deposit") : t("cartera.withdraw")}</p>
            <p className="mt-1 mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("cartera.amount")}</p>
            <div className="mt-1 flex items-center gap-2">
              {["10", "20", "50"].map((v) => (
                <button key={v} onClick={() => setAmountEur(v)} className={chip}
                  style={{ borderColor: amountEur === v ? "var(--win)" : "var(--line)", color: amountEur === v ? "var(--win)" : "var(--cream)" }}>{v} €</button>
              ))}
              <input value={amountEur} onChange={(e) => setAmountEur(e.target.value)} inputMode="decimal"
                className="w-20 rounded-[10px] border border-[var(--line)] bg-[var(--ink2)] px-2 py-1.5 text-center text-[13px] text-[var(--cream)] outline-none" />
            </div>
            {sheet === "deposit" ? (
              <>
                <p className="mt-3 mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("cartera.method")}</p>
                <div className="mt-1 flex gap-2">
                  {[["bizum", t("cartera.method.bizum")], ["card", t("cartera.method.card")]].map(([v, label]) => (
                    <button key={v} onClick={() => setMethod(v)} className={chip}
                      style={{ borderColor: method === v ? "var(--win)" : "var(--line)", color: method === v ? "var(--win)" : "var(--cream)" }}>{label}</button>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">{t("cartera.withdrawInfo")}</p>
            )}
            {err && <p className="mt-2 text-[12px] text-[var(--red)]">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={submit} disabled={busy}
                className="flex-1 rounded-[12px] bg-[var(--win)] px-4 py-3 text-[14px] font-black text-[var(--ink)] disabled:opacity-50">
                {busy ? t("cartera.processing")
                  : sheet === "deposit" ? t("cartera.depositCta", { amount: `${amountEur} €` }) : t("cartera.withdrawCta", { amount: `${amountEur} €` })}
              </button>
              <button onClick={() => setSheet(null)} className="rounded-[12px] border border-[var(--line)] px-4 text-[14px] font-bold text-[var(--muted)]">{t("cartera.back")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
