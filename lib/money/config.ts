// Configuración de dinero por país (M0, docs/money/CONTRATOS_M0.md §B3).
// Solo servidor: lee remote_config('money') + remote_config('misc').env, con
// tolerancia total a fallos (si no hay backend o la fila no existe, defaults).
// No transporta saldos: solo modo, límites y referencias legales por país.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoneyMode } from "@/packages/money-provider/src";

export type MoneyCountryCfg = {
  mode: MoneyMode;
  enabled: boolean;
  legal_basis_ref: string | null;
  currency?: string;
  domain?: string;
  provider?: string | null;
  stakes_minor?: number[];
  limits?: { stake_max_minor: number; pools_per_day_max: number };
  rg?: Record<string, unknown>;
  affiliate?: { enabled: boolean; legal_basis_ref: string | null };
};

export type MoneyCfg = {
  global: {
    kill_switch: boolean;
    max_stakes_minor: number[];
    rake_bps_default: number;
    min_participants: number;
    settle_review_threshold_minor: number;
  };
  countries: Record<string, MoneyCountryCfg>;
  env: string;
};

// Fallback si no hay backend: nada habilitado, entorno 'production' (el más
// restrictivo: el mock jamás se admite). Coincide con el seed de 0045 §7.
export const MONEY_DEFAULTS: MoneyCfg = {
  global: {
    kill_switch: false,
    max_stakes_minor: [500, 1000, 2000],
    rake_bps_default: 500,
    min_participants: 2,
    settle_review_threshold_minor: 50000,
  },
  countries: {},
  env: "production",
};

// Lee la configuración de dinero. Nunca lanza: ante cualquier problema devuelve
// los defaults (dinero apagado). `sb` puede ser null (sin env de Supabase).
export async function getMoneyConfig(sb: SupabaseClient | null): Promise<MoneyCfg> {
  const fallback: MoneyCfg = {
    global: { ...MONEY_DEFAULTS.global },
    countries: {},
    env: MONEY_DEFAULTS.env,
  };
  if (!sb) return fallback;
  try {
    const { data } = await sb
      .from("remote_config")
      .select("key, value")
      .in("key", ["money", "misc"]);
    const rows = (data ?? []) as { key: string; value: unknown }[];
    const money = (rows.find((r) => r.key === "money")?.value ?? {}) as Partial<MoneyCfg>;
    const misc = (rows.find((r) => r.key === "misc")?.value ?? {}) as { env?: unknown };
    return {
      global: { ...MONEY_DEFAULTS.global, ...(money.global ?? {}) },
      countries: (money.countries ?? {}) as Record<string, MoneyCountryCfg>,
      env: typeof misc.env === "string" ? misc.env : MONEY_DEFAULTS.env,
    };
  } catch {
    return fallback;
  }
}

// Config de un país (normaliza ISO-2 a mayúsculas). null si no existe.
export function countryCfg(cfg: MoneyCfg, iso: string | null): MoneyCountryCfg | null {
  if (!iso) return null;
  const key = iso.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(key)) return null;
  return cfg.countries[key] ?? null;
}
