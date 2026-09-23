"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MoneyView } from "@/lib/money/server";

// CTA de la modalidad de dinero (M0, docs/money/CONTRATOS_M0.md §B4).
// - Copy regulado SIEMPRE desde el diccionario `dict` (messages/money/*), nunca
//   por t(): este componente jamás importa @/lib/i18n ni nada de anuncios.
// - Se monta SOLO vía MoneyMount (dynamic, ssr:false), y MoneyMount solo se
//   pinta cuando hay una bolsa elegible y diccionario aprobado. En producción,
//   con el copy sin firmar, loadMoneyDict devuelve null y esto no llega a montar.
// - Estilo visual como components/PickPanel.tsx: var(--win) / var(--ink2) / var(--line).
//
// Pie legal (+18, juego responsable, autoexclusión) SIEMPRE visible.

type Opt = { id: string; label: string };

export function MoneyCta({
  view,
  slug,
  dict,
  options,
}: {
  view: MoneyView;
  slug: string;
  dict: Record<string, string>;
  options: Opt[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(view.myParticipation?.optionIdx ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Interpolación local {x}: el diccionario regulado no puede pasar por t() ni por
  // el tm() server-only de lib/money/i18n (este archivo es cliente).
  const tm = (key: string, vars?: Record<string, string>) => {
    const base = dict[key] ?? key;
    if (!vars) return base;
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), base);
  };

  // Importes con Intl; si la divisa no es estándar, formato simple.
  const fmtEur = (minor: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: view.currency }).format(minor / 100);
    } catch {
      return `${(minor / 100).toFixed(2)} ${view.currency}`;
    }
  };
  const entryFmt = fmtEur(view.stakeMinor);
  // Comisión de Vinko sobre la entrada (rake_bps: 500 = 5%). Se muestra SIEMPRE
  // antes de confirmar, en euros y en %. La cobra el proveedor licenciado.
  const commissionMinor = Math.round((view.stakeMinor * view.rakeBps) / 10000);
  const commissionFmt = fmtEur(commissionMinor);
  const pctFmt = (view.rakeBps % 100 === 0 ? (view.rakeBps / 100).toFixed(0) : (view.rakeBps / 100).toFixed(1));

  async function post(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data: data as Record<string, unknown> };
    } catch {
      return { ok: false, data: {} };
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (selected == null || busy) return;
    const { ok, data } = await post("/api/money/join", { poolId: view.poolId, optionIdx: selected });
    if (ok && typeof data.cashierUrl === "string") {
      window.location.href = data.cashierUrl;
      return;
    }
    setErr(tm("money.error"));
  }

  async function startKyc() {
    if (busy) return;
    const { ok, data } = await post("/api/money/kyc", { poolId: view.poolId });
    if (ok && typeof data.url === "string") {
      window.location.href = data.url;
      return;
    }
    setErr(tm("money.error"));
  }

  async function withdraw() {
    if (busy) return;
    const { ok } = await post("/api/money/withdraw", { poolId: view.poolId });
    if (ok) router.refresh();
    else setErr(tm("money.error"));
  }

  const part = view.myParticipation;
  const open = view.status === "open";

  let panel: React.ReactNode;
  if (!open) {
    panel = <p className="text-center text-xs text-[var(--muted)]">{tm("money.closed")}</p>;
  } else if (part?.status === "pending") {
    panel = <p className="text-sm font-bold text-[var(--cream)]">{tm("money.pending")}</p>;
  } else if (part && (part.status === "confirmed" || part.status === "paid")) {
    panel = (
      <div className="flex flex-col gap-2.5">
        <p className="text-sm font-bold text-[var(--cream)]">{tm("money.confirmed")}</p>
        {view.withdrawAllowed && (
          <button
            onClick={withdraw}
            disabled={busy}
            className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3 text-center text-[14px] font-bold text-[var(--cream)] disabled:opacity-50 hover:border-[var(--win)]"
          >
            {tm("money.withdraw")}
          </button>
        )}
      </div>
    );
  } else if (part?.status === "refunded") {
    panel = <p className="text-sm font-bold text-[var(--cream)]">{tm("money.withdrawn")}</p>;
  } else if (!view.eligibility.eligible) {
    // No elegible: motivos legibles + verificación SOLO si el KYC es lo único que
    // falta. Nunca se ofrece verificar a un menor, autoexcluido, etc. (regla de oro
    // 8): con la página ya filtrada, esos ni ven la sección; esto es defensa extra.
    const reasons = view.eligibility.reasons;
    const soft = new Set(["kyc_required", "kyc_pending", "limit_reached"]);
    const kycOnly = reasons.includes("kyc_required") && reasons.every((r) => soft.has(r));
    panel = (
      <div className="flex flex-col gap-2">
        {reasons.map((r) => (
          <p key={r} className="text-[13px] text-[var(--muted)]">
            {tm("money.reason." + r)}
          </p>
        ))}
        {kycOnly && (
          <button
            onClick={startKyc}
            disabled={busy}
            className="mt-1 rounded-[14px] bg-[var(--win)] px-4 py-3.5 text-center text-[15px] font-black text-[var(--ink)] disabled:opacity-50"
          >
            {tm("money.kyc")}
          </button>
        )}
      </div>
    );
  } else {
    // Elegible sin participación (o reintento tras fallo): elegir opción y pagar.
    panel = (
      <div className="flex flex-col gap-2.5">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">{tm("money.chooseOption")}</p>
        {options.map((o, i) => (
          <button
            key={o.id}
            onClick={() => setSelected(i)}
            disabled={busy}
            aria-pressed={selected === i}
            className="rounded-[14px] border bg-[var(--ink2)] px-4 py-3.5 text-left text-[15px] font-bold text-[var(--cream)] disabled:opacity-50"
            style={{ borderColor: selected === i ? "var(--win)" : "var(--line)" }}
          >
            {o.label}
          </button>
        ))}
        {/* Boleto (§5.4): entrada, comisión de Vinko y nota de cobro por reparto,
            SIEMPRE antes de confirmar. Nunca se promete una cifra exacta. */}
        <div className="flex flex-col gap-1.5 rounded-[12px] border border-[var(--line)] bg-[var(--ink)] p-3">
          <div className="flex items-center justify-between text-[13px] text-[var(--muted)]">
            <span>{tm("money.entry")}</span>
            <span className="mono font-black text-[var(--cream)]">{entryFmt}</span>
          </div>
          <div className="flex items-center justify-between text-[13px] text-[var(--muted)]">
            <span>{tm("money.commission", { pct: pctFmt })}</span>
            <span className="mono text-[var(--muted)]">−{commissionFmt}</span>
          </div>
          <p className="text-[11px] leading-snug text-[var(--muted2)]">{tm("money.payoutNote")}</p>
        </div>
        <button
          onClick={join}
          disabled={busy || selected == null}
          className="rounded-[14px] bg-[var(--win)] px-4 py-3.5 text-center text-[15px] font-black text-[var(--ink)] disabled:opacity-50"
        >
          {busy ? tm("money.paying") : selected == null ? tm("money.cta") : tm("money.pay", { amount: entryFmt })}
        </button>
      </div>
    );
  }

  return (
    <section
      data-slug={slug}
      className="flex flex-col gap-3 rounded-[16px] border border-[var(--gold)] bg-[var(--ink2)] p-4"
    >
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">{tm("money.cta")}</p>
      {panel}
      {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}

      {/* Pie legal SIEMPRE visible (§B4): +18, juego responsable, autoexclusión. */}
      <div className="mt-1 flex flex-col gap-1.5 border-t border-[var(--line)] pt-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mono rounded-full border border-[var(--gold)] px-2 py-0.5 text-[10px] font-black text-[var(--gold)]">
            {tm("money.legal.age")}
          </span>
          <span className="mono rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
            {tm("money.legal.rg")}
          </span>
          <span className="mono rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
            {tm("money.legal.selfExclusion")}
          </span>
        </div>
        <p className="text-[11px] text-[var(--muted)]">{tm("money.legal.help")}</p>
      </div>
    </section>
  );
}

// Export por defecto: MoneyMount lo carga con dynamic() sin nombrar el símbolo,
// para que la cadena "MoneyCta" no aparezca en los chunks eager de la página
// (lo verifica tests/unit/money-bundle.test.mjs). Ver la nota de MoneyMount.tsx.
export default MoneyCta;
