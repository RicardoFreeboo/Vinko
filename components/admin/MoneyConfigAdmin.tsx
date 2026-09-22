"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GlassCard } from "@/components/backstage/ui";
import { tMoney as t, moneyErr } from "@/components/admin/MoneyI18n";
import type { MoneyMode } from "@/components/admin/MoneyAdmin";

// Configuración por país (M0). Única vía de escritura de
// remote_config.money.countries: rpc('money_config_set_country'). El RPC valida
// modo, base legal, proveedor, dominio, divisa y registro de autoexclusión; los
// errores VINKO_MONEY_* se muestran traducidos. Los campos que no aparecen en
// el formulario (métodos de pago, notas) se conservan tal cual.

export type CountryCfg = {
  mode?: string; enabled?: boolean; legal_basis_ref?: string | null; legal_basis_valid_from?: string | null;
  provider?: string | null; domain?: string | null; currency?: string | null;
  stakes_minor?: number[]; limits?: { stake_max_minor?: number; pools_per_day_max?: number };
  rg?: Record<string, unknown>; affiliate?: { enabled?: boolean; legal_basis_ref?: string | null };
  [k: string]: unknown;
};
export type ConfigData = { countries: Record<string, CountryCfg>; env: string; rakeBpsDefault: number };

const MODES: MoneyMode[] = ["points_only", "affiliate_only", "partner", "own"];
const NEW = "__new__";

type Draft = {
  mode: MoneyMode; enabled: boolean;
  legal_basis_ref: string; legal_basis_valid_from: string;
  provider: string; domain: string; currency: string;
  stakes_minor: string; stake_max_minor: string; pools_per_day_max: string;
  self_exclusion_registry: string; withdraw_before_close: boolean; no_winner_policy: string;
  affiliate_enabled: boolean; affiliate_legal_basis_ref: string;
};

function draftFrom(c: CountryCfg | null): Draft {
  const rg = (c?.rg ?? {}) as Record<string, unknown>;
  return {
    mode: (c?.mode as MoneyMode) ?? "points_only",
    enabled: !!c?.enabled,
    legal_basis_ref: (c?.legal_basis_ref as string) ?? "",
    legal_basis_valid_from: (c?.legal_basis_valid_from as string) ?? "",
    provider: (c?.provider as string) ?? "",
    domain: (c?.domain as string) ?? "",
    currency: (c?.currency as string) ?? "",
    stakes_minor: Array.isArray(c?.stakes_minor) ? (c!.stakes_minor as number[]).join(", ") : "",
    stake_max_minor: c?.limits?.stake_max_minor != null ? String(c.limits.stake_max_minor) : "",
    pools_per_day_max: c?.limits?.pools_per_day_max != null ? String(c.limits.pools_per_day_max) : "",
    self_exclusion_registry: typeof rg.self_exclusion_registry === "string" ? rg.self_exclusion_registry : "",
    withdraw_before_close: rg.withdraw_before_close !== false,
    no_winner_policy: typeof rg.no_winner_policy === "string" ? rg.no_winner_policy : "",
    affiliate_enabled: !!c?.affiliate?.enabled,
    affiliate_legal_basis_ref: (c?.affiliate?.legal_basis_ref as string) ?? "",
  };
}

const input = "w-full rounded-[10px] border border-[rgba(31,224,122,0.25)] bg-[rgba(12,21,18,0.6)] px-3 py-2 text-[13px] text-[var(--cream)] outline-none focus:border-[var(--win)]";
const lbl = "text-[11px] font-bold uppercase tracking-wide text-[rgba(244,241,233,0.5)]";
const btnWin = "rounded-[10px] bg-[var(--win)] px-3 py-2 text-[12px] font-black text-[#060b09] disabled:opacity-50";

export function MoneyConfigAdmin({ initial }: { initial: ConfigData }) {
  const router = useRouter();
  const [countries, setCountries] = useState<Record<string, CountryCfg>>(initial.countries);
  useEffect(() => { setCountries(initial.countries); }, [initial]);

  const isos = useMemo(() => Object.keys(countries).sort(), [countries]);
  const [sel, setSel] = useState<string>(isos[0] ?? NEW);
  const [newIso, setNewIso] = useState("");
  const [d, setD] = useState<Draft>(() => draftFrom(countries[isos[0] ?? ""] ?? null));
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(iso: string) {
    setSel(iso); setMsg(null);
    setD(draftFrom(iso === NEW ? null : (countries[iso] ?? null)));
  }
  const upd = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  function parseInts(csv: string): number[] | null {
    const parts = csv.split(",").map((s) => s.trim()).filter(Boolean);
    const out: number[] = [];
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isInteger(n) || n <= 0) return null;
      out.push(n);
    }
    return out;
  }
  function optInt(s: string): number | null | "bad" {
    const v = s.trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : "bad";
  }

  async function save() {
    const iso = (sel === NEW ? newIso : sel).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso)) { setMsg({ kind: "err", text: t("adminMoney.cfg.badCountry") }); return; }

    const stakes = parseInts(d.stakes_minor);
    if (stakes === null) { setMsg({ kind: "err", text: t("adminMoney.cfg.badStakes") }); return; }
    const stakeMax = optInt(d.stake_max_minor);
    const poolsPerDay = optInt(d.pools_per_day_max);
    if (stakeMax === "bad" || poolsPerDay === "bad") { setMsg({ kind: "err", text: t("adminMoney.cfg.badNumbers") }); return; }

    // Partir del valor existente para conservar métodos de pago, notas, etc.
    const base: CountryCfg = { ...(sel === NEW ? {} : (countries[iso] ?? {})) };

    const rg: Record<string, unknown> = { ...((base.rg as Record<string, unknown>) ?? {}) };
    rg.withdraw_before_close = d.withdraw_before_close;
    if (d.self_exclusion_registry.trim()) rg.self_exclusion_registry = d.self_exclusion_registry.trim();
    else delete rg.self_exclusion_registry;
    if (d.no_winner_policy.trim()) rg.no_winner_policy = d.no_winner_policy.trim();
    else delete rg.no_winner_policy;

    const limits: Record<string, number> = {};
    const prevLimits = (base.limits ?? {}) as { stake_max_minor?: number; pools_per_day_max?: number };
    const sm = stakeMax === null ? prevLimits.stake_max_minor : stakeMax;
    const pp = poolsPerDay === null ? prevLimits.pools_per_day_max : poolsPerDay;
    if (sm != null) limits.stake_max_minor = sm;
    if (pp != null) limits.pools_per_day_max = pp;

    const value: CountryCfg = {
      ...base,
      mode: d.mode,
      enabled: d.enabled,
      legal_basis_ref: d.legal_basis_ref.trim() || null,
      provider: d.provider.trim() || null,
      domain: d.domain.trim() || null,
      currency: d.currency.trim().toUpperCase() || null,
      stakes_minor: stakes,
      limits,
      rg,
      affiliate: {
        ...((base.affiliate ?? {}) as Record<string, unknown>),
        enabled: d.affiliate_enabled,
        legal_basis_ref: d.affiliate_legal_basis_ref.trim() || null,
      },
    };
    if (d.legal_basis_valid_from.trim()) value.legal_basis_valid_from = d.legal_basis_valid_from.trim();
    else delete value.legal_basis_valid_from;

    const sb = supabaseBrowser();
    if (!sb) { setMsg({ kind: "err", text: t("adminMoney.err.no_backend") }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await sb.rpc("money_config_set_country", { p_country: iso, p_value: value });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: moneyErr(error.message) }); return; }
    setCountries((m) => ({ ...m, [iso]: (data as CountryCfg) ?? value }));
    setSel(iso); setNewIso("");
    setMsg({ kind: "ok", text: t("adminMoney.cfg.savedCountry", { iso }) });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--cream)]">{t("adminMoney.cfg.title")}</h2>
        <p className="mt-1 max-w-[72ch] text-[12px] leading-relaxed text-[rgba(244,241,233,0.5)]">{t("adminMoney.cfg.how")}</p>
      </div>
      {msg && (
        <p className={`text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>{msg.text}</p>
      )}

      <GlassCard glow="gold">
        <p className="mb-3 text-[11px] leading-snug text-[rgba(244,241,233,0.45)]">{t("adminMoney.cfg.pick")}</p>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.selectCountry")}</span>
            <select value={sel} onChange={(e) => pick(e.target.value)} className={input}>
              {isos.map((iso) => <option key={iso} value={iso}>{iso}</option>)}
              <option value={NEW}>{t("adminMoney.cfg.newCountry")}</option>
            </select></label>
          {sel === NEW && (
            <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.otherCountry")}</span>
              <input value={newIso} maxLength={2} onChange={(e) => setNewIso(e.target.value)} className={`${input} mono uppercase`} />
              <span className="text-[10px] text-[rgba(244,241,233,0.4)]">{t("adminMoney.cfg.otherCountryHint")}</span></label>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.mode")}</span>
            <select value={d.mode} onChange={(e) => upd({ mode: e.target.value as MoneyMode })} className={input}>
              {MODES.map((m) => <option key={m} value={m}>{t(`adminMoney.mode.${m}`)}</option>)}
            </select></label>
          <label className="flex items-center gap-2 md:mt-6"><input type="checkbox" checked={d.enabled} onChange={(e) => upd({ enabled: e.target.checked })} />
            <span className={lbl}>{t("adminMoney.cfg.enabled")}</span></label>
          <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.currency")}</span>
            <input value={d.currency} maxLength={3} onChange={(e) => upd({ currency: e.target.value })} className={`${input} mono uppercase`} /></label>

          <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.legalBasisRef")}</span>
            <input value={d.legal_basis_ref} onChange={(e) => upd({ legal_basis_ref: e.target.value })} className={input} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.legalBasisValidFrom")}</span>
            <input type="date" value={d.legal_basis_valid_from} onChange={(e) => upd({ legal_basis_valid_from: e.target.value })} className={`${input} mono`} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.provider")}</span>
            <input value={d.provider} onChange={(e) => upd({ provider: e.target.value })} className={`${input} mono`} />
            <span className="text-[10px] text-[rgba(244,241,233,0.4)]">{t("adminMoney.cfg.providerHint")}</span></label>

          <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.domain")}</span>
            <input value={d.domain} onChange={(e) => upd({ domain: e.target.value })} className={`${input} mono`} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.stakesMinor")}</span>
            <input value={d.stakes_minor} onChange={(e) => upd({ stakes_minor: e.target.value })} className={`${input} mono`} /></label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.stakeMax")}</span>
              <input value={d.stake_max_minor} inputMode="numeric" onChange={(e) => upd({ stake_max_minor: e.target.value })} className={`${input} mono`} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.poolsPerDay")}</span>
              <input value={d.pools_per_day_max} inputMode="numeric" onChange={(e) => upd({ pools_per_day_max: e.target.value })} className={`${input} mono`} /></label>
          </div>

          <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.selfExclusionRegistry")}</span>
            <input value={d.self_exclusion_registry} onChange={(e) => upd({ self_exclusion_registry: e.target.value })} className={`${input} mono`} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.cfg.noWinnerPolicy")}</span>
            <input value={d.no_winner_policy} onChange={(e) => upd({ no_winner_policy: e.target.value })} className={`${input} mono`} />
            <span className="text-[10px] text-[rgba(244,241,233,0.4)]">{t("adminMoney.cfg.noWinnerPolicyHint")}</span></label>
          <label className="flex items-center gap-2 md:mt-6"><input type="checkbox" checked={d.withdraw_before_close} onChange={(e) => upd({ withdraw_before_close: e.target.checked })} />
            <span className={lbl}>{t("adminMoney.cfg.withdrawBeforeClose")}</span></label>

          <label className="flex items-center gap-2 md:mt-6"><input type="checkbox" checked={d.affiliate_enabled} onChange={(e) => upd({ affiliate_enabled: e.target.checked })} />
            <span className={lbl}>{t("adminMoney.cfg.affiliateEnabled")}</span></label>
          <label className="flex flex-col gap-1 md:col-span-2"><span className={lbl}>{t("adminMoney.cfg.affiliateLegalBasisRef")}</span>
            <input value={d.affiliate_legal_basis_ref} onChange={(e) => upd({ affiliate_legal_basis_ref: e.target.value })} className={input} /></label>
        </div>

        <div className="mt-4">
          <button onClick={save} disabled={busy} className={btnWin}>{t("adminMoney.cfg.save")}</button>
        </div>
      </GlassCard>
    </div>
  );
}
