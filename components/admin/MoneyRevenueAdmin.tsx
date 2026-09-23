"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { tMoney as t } from "@/components/admin/MoneyI18n";

// Parte B (VINKO_BILLING_SPEC): conciliación del rev-share que el operador
// licenciado liquida a Vinko. Solo REGISTRA lo que te pagan; no mueve el bote ni
// cobra tarjetas. Todo por RPC revenue_share_record (admin).
export type RevStatement = {
  id: number; provider: string; period: string; gross_rake_minor: number;
  vinko_share_minor: number; currency: string; paid_at: string | null; invoice_ref: string | null;
};
export type RevSummary = {
  statements: RevStatement[]; settled_pools: number; total_share_minor: number; pending_share_minor: number;
};

const money = (minor: number, cur: string) => {
  try { return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur || "EUR" }).format((minor || 0) / 100); }
  catch { return `${((minor || 0) / 100).toFixed(2)} ${cur}`; }
};

const card = "rounded-[16px] border border-[rgba(255,194,61,0.2)] bg-[rgba(255,255,255,0.02)] p-4";
const input = "w-full rounded-[10px] border border-[rgba(255,194,61,0.25)] bg-black/30 px-3 py-2 text-sm text-[var(--cream,#f4f1e9)] outline-none";

export function MoneyRevenueAdmin({ initial }: { initial: RevSummary }) {
  const [sum, setSum] = useState<RevSummary>(initial);
  const [f, setF] = useState({ provider: "", period: "", gross: "", share: "", currency: "EUR", invoice: "", paid: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const sb = supabaseBrowser(); if (!sb) return;
    const { data } = await sb.rpc("revenue_share_summary");
    if (data) setSum(data as RevSummary);
  }

  async function save() {
    const sb = supabaseBrowser(); if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("revenue_share_record", {
      p_provider: f.provider.trim(), p_period: f.period.trim(),
      p_gross_minor: Math.max(0, Math.round(Number(f.gross) || 0)),
      p_share_minor: Math.max(0, Math.round(Number(f.share) || 0)),
      p_currency: f.currency.trim().toUpperCase(),
      p_paid_at: f.paid ? new Date().toISOString() : null,
      p_invoice: f.invoice.trim() || null, p_legal_basis_ref: null,
    });
    setBusy(false);
    if (error) { setErr(error.message.replace("VINKO_", "")); return; }
    setF({ provider: "", period: "", gross: "", share: "", currency: "EUR", invoice: "", paid: false });
    await refresh();
  }

  const th = "py-1.5 pr-3 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(244,241,233,0.5)]";
  const td = "py-1.5 pr-3 text-[13px] text-[var(--cream,#f4f1e9)] align-top";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-snug text-[rgba(244,241,233,0.7)]">{t("adminMoney.rev.intro")}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className={card}><div className="text-[11px] uppercase tracking-[0.1em] text-[rgba(244,241,233,0.5)]">{t("adminMoney.rev.total")}</div><div className="mt-1 text-[20px] font-black text-[var(--win,#1fe07a)]">{money(sum.total_share_minor, "EUR")}</div></div>
        <div className={card}><div className="text-[11px] uppercase tracking-[0.1em] text-[rgba(244,241,233,0.5)]">{t("adminMoney.rev.pending")}</div><div className="mt-1 text-[20px] font-black text-[var(--gold,#ffc23d)]">{money(sum.pending_share_minor, "EUR")}</div></div>
        <div className={card}><div className="text-[11px] uppercase tracking-[0.1em] text-[rgba(244,241,233,0.5)]">{t("adminMoney.rev.settledPools")}</div><div className="mt-1 text-[20px] font-black text-[var(--cream,#f4f1e9)]">{sum.settled_pools}</div></div>
      </div>

      <div className={card}>
        <div className="mb-2 font-bold text-[var(--cream,#f4f1e9)]">{t("adminMoney.rev.record")}</div>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder={t("adminMoney.rev.provider")} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />
          <input className={input} placeholder={t("adminMoney.rev.period")} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />
          <input className={input} inputMode="numeric" placeholder={t("adminMoney.rev.gross")} value={f.gross} onChange={(e) => setF({ ...f, gross: e.target.value })} />
          <input className={input} inputMode="numeric" placeholder={t("adminMoney.rev.share")} value={f.share} onChange={(e) => setF({ ...f, share: e.target.value })} />
          <input className={input} maxLength={3} placeholder={t("adminMoney.rev.currency")} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} />
          <input className={input} placeholder={t("adminMoney.rev.invoice")} value={f.invoice} onChange={(e) => setF({ ...f, invoice: e.target.value })} />
        </div>
        <label className="mt-2 flex items-center gap-2 text-[13px] text-[var(--cream,#f4f1e9)]">
          <input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} /> {t("adminMoney.rev.paid")}
        </label>
        {err && <p className="mt-2 text-[12px] text-[var(--red,#ff5a5f)]">{err}</p>}
        <button type="button" onClick={save} disabled={busy || !f.provider.trim() || !f.period.trim()}
          className="mt-3 rounded-[10px] bg-[var(--gold,#ffc23d)] px-4 py-2.5 text-[13px] font-black text-[#060b09] disabled:opacity-50">
          {t("adminMoney.rev.save")}
        </button>
      </div>

      {sum.statements.length === 0 ? (
        <p className="text-[13px] text-[rgba(244,241,233,0.6)]">{t("adminMoney.rev.none")}</p>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>{t("adminMoney.rev.period")}</th><th className={th}>{t("adminMoney.rev.provider")}</th><th className={th}>{t("adminMoney.rev.share")}</th><th className={th}>{t("adminMoney.rev.paid")}</th></tr></thead>
            <tbody>
              {sum.statements.map((s) => (
                <tr key={s.id} className="border-t border-[rgba(255,194,61,0.12)]">
                  <td className={`${td} mono`}>{s.period}</td>
                  <td className={td}>{s.provider}</td>
                  <td className={`${td} font-black text-[var(--win,#1fe07a)]`}>{money(s.vinko_share_minor, s.currency)}</td>
                  <td className={td}>{s.paid_at ? "✓" : <span className="text-[var(--gold,#ffc23d)]">{t("adminMoney.rev.pendingTag")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
