"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

// Impugnar el resultado (F-04). Solo participantes reales, porra resuelta y
// dentro de las 24 h desde resolved_at. dispute_porra (0042) cuenta las
// impugnaciones; al llegar al umbral max(3, 30 %) la porra pasa a 'disputed'
// (reparto congelado, provisional) y Vinko decide en /admin/porras.
// El estado inicial viene del SSR (porra_dispute_state): el HTML ya dice
// "Impugnada por N" sin JS.
export type DisputeState = {
  status: string;
  disputes: number;
  participants: number;
  threshold: number;
  mine: boolean;
  participant: boolean;
  window_until: string | null;
  outcome: "upheld" | "reversed" | null;
};

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

export function DisputePanel({ porraId, state, defaultOpen = false }: {
  porraId: string;
  state: DisputeState;
  defaultOpen?: boolean; // formulario abierto de entrada (enlace directo)
}) {
  const router = useRouter();
  const [n, setN] = useState(state.disputes);
  const [threshold, setThreshold] = useState(state.threshold);
  const [mine, setMine] = useState(state.mine);
  const [frozen, setFrozen] = useState(state.status === "disputed");
  const [open, setOpen] = useState(defaultOpen);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inWindow = !!state.window_until && Date.parse(state.window_until) > Date.now();
  const canDispute = state.status === "resolved" && state.participant && !mine && inWindow && state.outcome !== "upheld";

  function mapErr(m: string): string {
    if (m.includes("WINDOW_CLOSED")) return t("dispute.errWindow");
    if (m.includes("NOT_PARTICIPANT")) return t("dispute.errParticipant");
    if (m.includes("DISPUTE_CLOSED")) return t("dispute.errClosed");
    if (m.includes("BAD_REASON")) return t("dispute.errReason");
    if (m.includes("BAD_STATE")) return t("dispute.errState");
    if (m.includes("NO_AUTH")) return t("dispute.errAuth");
    return t("dispute.err");
  }

  async function send() {
    if (busy) return;
    const clean = reason.trim();
    if (clean.length < 3) { setErr(t("dispute.errReason")); return; }
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { data, error } = await sb.rpc("dispute_porra", { p_porra: porraId, p_reason: clean });
    setBusy(false);
    if (error) { setErr(mapErr(error.message)); return; }
    const d = (data ?? {}) as { disputes?: number; threshold?: number; frozen?: boolean };
    if (typeof d.disputes === "number") setN(d.disputes);
    if (typeof d.threshold === "number") setThreshold(d.threshold);
    setMine(true); setOpen(false);
    if (d.frozen) { setFrozen(true); router.refresh(); }
  }

  if (frozen) {
    // El banner "En revisión" ya va arriba (SSR, junto al título): aquí solo el recuento.
    return (
      <section className="rounded-[16px] border border-[var(--gold)] bg-[rgba(255,194,61,0.06)] p-4">
        <p className="text-[13px] text-[var(--cream)]">{t("dispute.frozen", { n: String(n) })}</p>
      </section>
    );
  }

  if (n === 0 && !canDispute && !mine) return null;

  return (
    <section className="flex flex-col gap-2.5 rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4">
      {n > 0 && (
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[14px] font-black text-[var(--cream)]">
            {n === 1 ? t("dispute.countOne") : t("dispute.countMany", { n: String(n) })}
          </p>
          <p className="mono shrink-0 text-[11px] text-[var(--muted)]">{t("dispute.progress", { n: String(n), m: String(threshold) })}</p>
        </div>
      )}

      {mine ? (
        <p className="text-[13px] text-[var(--muted)]">{t("dispute.mine", { m: String(threshold) })}</p>
      ) : canDispute && !open ? (
        <button type="button" onClick={() => { setOpen(true); setErr(null); }}
          className="text-left text-[13px] font-bold text-[var(--cream)]">
          {t("dispute.tag")} <span className="text-[var(--gold)] underline">{t("dispute.cta")}</span>
        </button>
      ) : canDispute && open ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-[var(--muted)]">{t("dispute.why")}</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2}
            placeholder={t("dispute.ph")}
            className="rounded-[12px] border border-[var(--line)] bg-[var(--ink)] px-3.5 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--gold)]" />
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={busy}
              className="flex-1 rounded-[12px] border border-[var(--gold)] px-3 py-2.5 text-[13px] font-black text-[var(--gold)] disabled:opacity-50">
              {busy ? t("dispute.busy") : t("dispute.send")}
            </button>
            <button type="button" onClick={() => { setOpen(false); setErr(null); }} disabled={busy}
              className="rounded-[12px] border border-[var(--line)] px-3 py-2.5 text-[13px] font-bold text-[var(--muted)]">
              {t("dispute.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {canDispute && state.window_until && (
        <p className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted2)]">
          {t("dispute.window", { date: fmtDate(state.window_until) })}
        </p>
      )}
      {err && <p className="text-xs text-[var(--red)]">{err}</p>}
    </section>
  );
}
