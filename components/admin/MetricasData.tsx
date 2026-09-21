// Tipos, carga y formato de las métricas de /admin (RPC kpi_* de la migración
// 0033). Solo servidor. Si una RPC no existe (migración sin aplicar) devuelve
// null y la página lo dice: jamás se inventa un número.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Bucket = { n: number; elig: number };
export type Cohort = { week: string; n: number; d1: Bucket; d7: Bucket; d30: Bucket };
export type Retention = { today: string; cohorts: Cohort[]; total: Omit<Cohort, "week"> };

export type DauPoint = { day: string; dau: number; wau: number; mau: number };
export type DauMau = {
  today: string; series: DauPoint[];
  dau: number; wau: number; mau: number; users: number; active_ever: number;
};

export type Funnel = {
  signups: number;
  first_pick: { n: number; median_h: number | null };
  created: { n: number; median_h: number | null };
  shared: { n: number };
  invitee_validated: { n: number };
  repeat_creator: { n: number; of: number };
};

export type KFactor = {
  users: number; invitees_validated: number; invitees_pending: number; inviters: number;
  user_porras: number; porras_with_participants: number; participants_total: number;
  participants_avg: number | null; participants_median: number | null;
  shares: number; sharers: number; porras_shared: number;
  time_to_share: { n: number; median_h: number | null };
};

export type Flow = { n: number; pts: number; method: "rows" | "rule" };
export type EconomyWindow = {
  faucets: Record<string, Flow>; returns: Record<string, Flow>; sinks: Record<string, Flow>;
  faucets_total: number; returns_total: number; sinks_total: number; net: number;
};
export type Economy = {
  supply: number; holders: number;
  d7: EconomyWindow; d30: EconomyWindow; all: EconomyWindow;
  not_reconstructible: string[];
};

export type Metrics = {
  counts: Record<string, number>;
  retention: Retention | null;
  dau: DauMau | null;
  funnel: Funnel | null;
  kfactor: KFactor | null;
  economy: Economy | null;
  missing: boolean; // alguna RPC kpi_* no responde (0033 sin aplicar)
};

type Sb = Pick<SupabaseClient, "rpc">;

async function rpc<T>(sb: Sb, fn: string, args: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await sb.rpc(fn, args);
  if (error || data == null) return null;
  return data as T;
}

export async function loadMetrics(sb: Sb | null, excludeAdmins = false): Promise<Metrics> {
  const empty: Metrics = { counts: {}, retention: null, dau: null, funnel: null, kfactor: null, economy: null, missing: true };
  if (!sb) return empty;
  const args = { p_exclude_admins: excludeAdmins };
  const [counts, retention, dau, funnel, kfactor, economy] = await Promise.all([
    rpc<Record<string, number>>(sb, "kpi_counts", {}),
    rpc<Retention>(sb, "kpi_retention", args),
    rpc<DauMau>(sb, "kpi_dau_mau", args),
    rpc<Funnel>(sb, "kpi_funnel", args),
    rpc<KFactor>(sb, "kpi_kfactor", args),
    rpc<Economy>(sb, "kpi_economy", args),
  ]);
  return {
    counts: counts ?? {}, retention, dau, funnel, kfactor, economy,
    missing: !retention || !dau || !funnel || !kfactor || !economy,
  };
}

// El mando solo necesita embudo y viralidad.
export async function loadMando(sb: Sb | null): Promise<{ funnel: Funnel | null; kfactor: KFactor | null }> {
  if (!sb) return { funnel: null, kfactor: null };
  const args = { p_exclude_admins: false };
  const [funnel, kfactor] = await Promise.all([rpc<Funnel>(sb, "kpi_funnel", args), rpc<KFactor>(sb, "kpi_kfactor", args)]);
  return { funnel, kfactor };
}

// Formato es-ES. 0 se enseña como 0; "—" solo cuando el cociente no existe
// (denominador 0) o la mediana no tiene datos.
const nf = new Intl.NumberFormat("es-ES");
export const fmtInt = (n: number | null | undefined) => nf.format(Math.round(n ?? 0));
export const fmtDec = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : new Intl.NumberFormat("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
export const fmtPct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
export const fmtRatio = (n: number, d: number, dec = 2) => (d > 0 ? fmtDec(n / d, dec) : "—");
export const fmtH = (h: number | null | undefined) => (h == null ? "—" : `${fmtDec(h, 1)} h`);
