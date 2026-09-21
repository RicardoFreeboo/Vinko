"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { capture } from "@/lib/analytics";
import { Confetti } from "@/components/Confetti";
import { t } from "@/lib/i18n";

// El juez (creador, árbitro aceptado o admin) elige la opción ganadora →
// resolve_porra reparte los Vinkos en servidor y avisa a todos. Secundario:
// anular y devolver (void_porra) con motivo. Solo se monta si la porra está
// cerrada y sin resolver (o si el que mira es admin).
type Opt = { id: string; label: string };
const OPT_ACCENT = ["var(--win)", "var(--gold)", "var(--win)", "var(--gold)", "var(--win)", "var(--gold)"];

export function ResolvePanel({ porraId, options, source, canResolve, canVoid, early = false, criteria = null }: {
  porraId: string;
  options: Opt[];
  source: string;
  canResolve: boolean; // false = solo anular (creador antes del cierre)
  canVoid: boolean;
  early?: boolean; // admin resolviendo antes de la hora de cierre
  criteria?: string | null; // "Se resuelve: …" (porras.resolution_criteria, 0041) — recordatorio al juez
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "resolved" | "voided">(null);
  const [err, setErr] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");

  function mapErr(m: string, fallback: string): string {
    if (m.includes("NOT_CLOSED")) return t("resolve.errNotClosed");
    if (m.includes("NOT_CREATOR") || m.includes("NOT_ADMIN")) return t("resolve.errRole");
    if (m.includes("BAD_STATE")) return t("resolve.errState");
    return fallback;
  }

  async function resolve() {
    if (busy || !chosen) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("resolve_porra", { p_porra: porraId, p_winning: chosen });
    setBusy(false);
    if (error) { setErr(mapErr(error.message, t("resolve.err"))); return; }
    // Editorial queda fuera de la tracción (is_seed=true); las de usuario, dentro.
    capture("porra_resolved", { is_seed: source !== "user", source });
    setDone("resolved");
    router.refresh();
  }

  async function voidIt() {
    if (busy) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("void_porra", { p_porra: porraId, p_reason: reason.trim() || null });
    setBusy(false);
    if (error) { setErr(mapErr(error.message, t("resolve.voidErr"))); return; }
    setDone("voided");
    router.refresh();
  }

  if (done === "resolved") {
    return (
      <section className="rounded-[16px] border border-[var(--win)] bg-[var(--ink2)] p-4 text-center">
        <Confetti />
        <p className="text-[15px] font-black text-[var(--win)]">{t("resolve.done")}</p>
      </section>
    );
  }
  if (done === "voided") {
    return (
      <section className="rounded-[16px] border border-[var(--gold)] bg-[var(--ink2)] p-4 text-center">
        <p className="text-[15px] font-black text-[var(--gold)]">{t("resolve.voidDone")}</p>
      </section>
    );
  }

  const chosenLabel = options.find((o) => o.id === chosen)?.label ?? "";

  const voidUi = canVoid && (voidOpen ? (
    <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-3">
      <p className="text-[13px] text-[var(--muted)]">{t("resolve.voidWhy")}</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120}
        placeholder={t("resolve.voidPh")}
        className="rounded-[12px] border border-[var(--line)] bg-[var(--ink)] px-3.5 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--gold)]" />
      <div className="flex gap-2">
        <button type="button" onClick={voidIt} disabled={busy}
          className="flex-1 rounded-[12px] border border-[var(--gold)] px-3 py-2.5 text-[13px] font-black text-[var(--gold)] disabled:opacity-50">
          {t("resolve.voidCta")}
        </button>
        <button type="button" onClick={() => { setVoidOpen(false); setErr(null); }} disabled={busy}
          className="rounded-[12px] border border-[var(--line)] px-3 py-2.5 text-[13px] font-bold text-[var(--muted)]">
          {t("resolve.voidCancel")}
        </button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={() => setVoidOpen(true)} disabled={busy}
      className="text-center text-xs font-bold text-[var(--muted)] underline">
      {t("resolve.voidLink")}
    </button>
  ));

  if (!canResolve) {
    // Creador antes del cierre: solo puede anular (p. ej. evento suspendido).
    return (
      <section className="flex flex-col gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("resolve.judgeTag")}</p>
        {voidUi}
        {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-[var(--win)] bg-[var(--ink2)] p-4">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--win)]">{t("resolve.judgeTag")}</p>
      <p className="text-[17px] font-black leading-tight text-[var(--cream)]">{t("resolve.question")}</p>
      {criteria && <p className="text-[13px] text-[var(--muted)]">{t("resolve.criteriaHint", { c: criteria })}</p>}
      {early && <p className="text-xs text-[var(--gold)]">{t("resolve.earlyWarn")}</p>}

      {!voidOpen && (
        <>
          <div className="flex flex-col gap-2">
            {options.map((o, i) => {
              const accent = OPT_ACCENT[i % OPT_ACCENT.length];
              const on = chosen === o.id;
              return (
                <button key={o.id} type="button" onClick={() => { setChosen(o.id); setErr(null); }} disabled={busy}
                  aria-pressed={on}
                  className="flex items-center justify-between rounded-[12px] border px-3.5 py-3 text-left text-[14px] font-bold text-[var(--cream)] transition-colors disabled:opacity-50"
                  style={{ borderColor: on ? accent : "var(--line)", background: on ? "rgba(31,224,122,0.10)" : "transparent" }}>
                  <span>{o.label}</span>
                  {on && <span className="mono text-[12px] font-black" style={{ color: accent }}>✓</span>}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={resolve} disabled={busy || !chosen}
            className="rounded-[14px] bg-[var(--win)] px-4 py-3.5 text-[15px] font-black text-[var(--ink)] disabled:opacity-40">
            {busy ? t("resolve.busy") : chosen ? t("resolve.cta", { o: chosenLabel }) : t("resolve.ctaPick")}
          </button>
        </>
      )}

      {voidUi}

      {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
    </section>
  );
}
