// Elegibilidad de dinero (M0, docs/money/CONTRATOS_M0.md §B3, MN-01).
// PURO: sin imports de servidor (solo tipos, que se borran al compilar), para
// poder testearlo con una matriz de casos. No decide nada por sí solo sobre el
// usuario real: el KYC y el geobloqueo definitivos los hace el proveedor.
import type {
  Eligibility,
  EligibilityReason,
  KycStatus,
} from "@/packages/money-provider/src";
import type { MoneyCountryCfg } from "@/lib/money/config";

export type EligibilityInput = {
  anonymous: boolean;
  killSwitch: boolean;
  country: MoneyCountryCfg | null;
  ipCountry: string | null;
  declaredCountry: string | null;
  birthYear: number | null;
  nowYear: number;
  kyc: { status: KycStatus; country?: string | null } | null;
  selfExcluded: boolean;
  poolsToday: number;
  providerAvailable: boolean;
};

// Normaliza un ISO-2: mayúsculas y exactamente dos letras, o null.
function iso2(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

// País efectivo (diseño de docs/RESPUESTAS_MONEY_SPEC_22SEP.md §2):
//  - IP desconocida            → país declarado, 'geo_unknown'  (puntos sí, dinero no)
//  - sin país declarado        → país por IP,    'country_undeclared'
//  - IP ≠ declarado            → país declarado, 'geo_mismatch'
//  - KYC en otro país          → país declarado, 'geo_mismatch'
//  - todo cuadra               → país declarado, 'ok'
export function effectiveCountry(i: {
  ipCountry: string | null;
  declaredCountry: string | null;
  kycCountry?: string | null;
}): { country: string | null; reason: "ok" | "geo_unknown" | "country_undeclared" | "geo_mismatch" } {
  const ip = iso2(i.ipCountry);
  const dec = iso2(i.declaredCountry);
  const kyc = iso2(i.kycCountry ?? null);
  if (ip === null) return { country: dec, reason: "geo_unknown" };
  if (dec === null) return { country: ip, reason: "country_undeclared" };
  if (ip !== dec) return { country: dec, reason: "geo_mismatch" };
  if (kyc && kyc !== dec) return { country: dec, reason: "geo_mismatch" };
  return { country: dec, reason: "ok" };
}

// Elegibilidad completa (MN-01). Acumula TODAS las razones aplicables (no
// cortocircuita) para que la UI las muestre juntas, salvo `anonymous`, que
// devuelve solo ['anonymous']. Orden fijo:
//   anonymous → kill_switch → geo (undeclared/unknown/mismatch) → country_disabled
//   → underage → provider_unavailable → kyc → self_excluded → limit_reached.
export function computeEligibility(i: EligibilityInput): Eligibility {
  const kycStatus: KycStatus = i.kyc?.status ?? "none";

  // Anónimo: fuera antes de mirar nada más (nunca dinero para invitados).
  if (i.anonymous) {
    return { eligible: false, reasons: ["anonymous"], kycStatus, country: null };
  }

  const reasons: EligibilityReason[] = [];

  if (i.killSwitch) reasons.push("kill_switch");

  const eff = effectiveCountry({
    ipCountry: i.ipCountry,
    declaredCountry: i.declaredCountry,
    kycCountry: i.kyc?.country ?? null,
  });
  if (eff.reason !== "ok") reasons.push(eff.reason);

  const c = i.country;
  const countryLive = !!c && c.enabled && (c.mode === "partner" || c.mode === "own");
  if (!countryLive) reasons.push("country_disabled");

  const age = i.birthYear === null ? null : i.nowYear - i.birthYear;
  if (age === null || age < 18) reasons.push("underage");

  if (!i.providerAvailable) reasons.push("provider_unavailable");

  if (kycStatus !== "verified") {
    reasons.push(kycStatus === "pending" ? "kyc_pending" : "kyc_required");
  }

  if (i.selfExcluded) reasons.push("self_excluded");

  const perDayMax = c?.limits?.pools_per_day_max;
  if (typeof perDayMax === "number" && i.poolsToday >= perDayMax) {
    reasons.push("limit_reached");
  }

  const limits =
    c && c.limits
      ? {
          stakeMaxMinor: c.limits.stake_max_minor,
          poolsPerDayMax: c.limits.pools_per_day_max,
          currency: c.currency ?? "EUR",
        }
      : undefined;

  return { eligible: reasons.length === 0, reasons, kycStatus, country: eff.country, limits };
}
