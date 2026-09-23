"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

// Juego más seguro (§5.11 / RD 176/2023). Autoexclusión + límites de depósito.
// Fase 0: guarda la preferencia del usuario (apaga su UI de dinero). La aplicación
// real sobre cuentas la hace el operador en producción.
export type SaferState = { self_excluded_until: string | null; is_excluded: boolean; limits: Record<string, number> };

const card = "rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4";
const chip = "rounded-full border px-3 py-1.5 text-[13px] font-bold";
const fmt = (minor?: number) => (minor && minor > 0 ? String(minor / 100) : "");
const dateEs = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(d);
};

export function SaferPlayClient({ initial }: { initial: SaferState }) {
  const [s, setS] = useState<SaferState>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({
    daily: fmt(initial.limits?.daily_minor), weekly: fmt(initial.limits?.weekly_minor), monthly: fmt(initial.limits?.monthly_minor),
  });

  async function exclude(days: number) {
    const sb = supabaseBrowser(); if (!sb) return;
    setBusy(true); setErr(null);
    const { data, error } = await sb.rpc("safer_play_self_exclude", { p_days: days });
    setBusy(false); setConfirming(null);
    if (error) { setErr(t("safer.err")); return; }
    if (data) setS(data as SaferState);
  }
  async function setLimit(period: "daily" | "weekly" | "monthly") {
    const sb = supabaseBrowser(); if (!sb) return;
    const minor = Math.round((parseFloat((limits[period] || "").replace(",", ".")) || 0) * 100);
    setBusy(true); setErr(null);
    const { data, error } = await sb.rpc("safer_play_set_limit", { p_period: period, p_minor: minor });
    setBusy(false);
    if (error) { setErr(t("safer.err")); return; }
    if (data) setS(data as SaferState);
    setSaved(period); setTimeout(() => setSaved(null), 1500);
  }

  const periods: [number, string][] = [[30, t("safer.self.d30")], [90, t("safer.self.d90")], [180, t("safer.self.d180")], [365, t("safer.self.d365")]];

  return (
    <div className="flex flex-col gap-4">
      {s.is_excluded && (
        <p className="rounded-[12px] border border-[var(--gold)]/40 bg-[var(--ink2)] px-4 py-3 text-[13px] text-[var(--gold)]">
          {t("safer.self.active", { date: dateEs(s.self_excluded_until) })}
        </p>
      )}

      {/* Autoexclusión */}
      <section className={card}>
        <p className="text-sm font-black text-[var(--cream)]">{t("safer.self.title")}</p>
        <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{t("safer.self.body")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {periods.map(([d, label]) => (
            <button key={d} disabled={busy} onClick={() => setConfirming(d)} className={chip}
              style={{ borderColor: "var(--line)", color: "var(--cream)" }}>{label}</button>
          ))}
        </div>
        {confirming != null && (
          <div className="mt-3 rounded-[10px] border border-[var(--red)]/40 p-3">
            <p className="text-[12px] text-[var(--cream)]">{t("safer.self.confirm")}</p>
            <div className="mt-2 flex gap-2">
              <button disabled={busy} onClick={() => exclude(confirming)}
                className="rounded-[10px] bg-[var(--red)] px-4 py-2 text-[13px] font-black text-white disabled:opacity-50">{t("safer.self.cta")}</button>
              <button onClick={() => setConfirming(null)} className="rounded-[10px] border border-[var(--line)] px-4 text-[13px] font-bold text-[var(--muted)]">✕</button>
            </div>
          </div>
        )}
      </section>

      {/* Límites de depósito */}
      <section className={card}>
        <p className="text-sm font-black text-[var(--cream)]">{t("safer.limits.title")}</p>
        <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{t("safer.limits.body")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {(["daily", "weekly", "monthly"] as const).map((period) => (
            <div key={period} className="flex items-center gap-2">
              <span className="w-24 text-[13px] text-[var(--cream)]">{t(`safer.limits.${period}`)}</span>
              <input value={limits[period]} onChange={(e) => setLimits({ ...limits, [period]: e.target.value })}
                inputMode="decimal" placeholder={t("safer.limits.none")}
                className="w-24 rounded-[10px] border border-[var(--line)] bg-[var(--ink)] px-2 py-1.5 text-center text-[13px] text-[var(--cream)] outline-none" />
              <span className="text-[13px] text-[var(--muted)]">€</span>
              <button disabled={busy} onClick={() => setLimit(period)}
                className="ml-auto rounded-[10px] border border-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[var(--gold)] disabled:opacity-50">
                {saved === period ? t("safer.saved") : t("safer.limits.save")}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Ayuda */}
      <section className={card}>
        <p className="text-sm font-black text-[var(--cream)]">{t("safer.help.title")}</p>
        <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{t("safer.help.body")}</p>
      </section>

      <p className="text-center text-[11px] text-[var(--muted2)]">{t("safer.age")}</p>
      {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
    </div>
  );
}
