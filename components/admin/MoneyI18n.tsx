import { t as t0 } from "@/lib/i18n";
import esParts from "@/messages/parts/money-admin.es.json";
import enParts from "@/messages/parts/money-admin.en.json";

// t() con red de seguridad, igual que tSponsors en components/SponsorBadge.tsx:
// hasta que scripts/i18n-merge.mjs funda messages/parts/money-admin.*.json en
// es.json/en.json, t() devolvería la propia clave. Tras la fusión t() resuelve
// y este respaldo deja de intervenir. Módulo SIN "use client" a propósito: lo
// importan tanto las páginas de servidor como los componentes de cliente del
// panel de dinero (un módulo cliente no puede exportar una función llamable
// desde un Server Component).
const PARTS: Record<string, Record<string, string>> = { es: esParts, en: enParts };

export function tMoney(key: string, vars?: Record<string, string>): string {
  let s = t0(key, vars);
  if (s === key) {
    s = PARTS.es[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

// Traduce un mensaje de error (código de la API en minúsculas, código
// VINKO_* suelto o mensaje largo de Postgres que lo contiene) a su texto.
export function moneyErr(message: string | null | undefined): string {
  const m = String(message ?? "").trim();
  if (!m) return tMoney("adminMoney.err.generic");
  const exact = tMoney("adminMoney.err." + m);
  if (exact !== "adminMoney.err." + m) return exact;
  if (/does not exist|schema cache|could not find/i.test(m)) return tMoney("adminMoney.err.pending_migration");
  const code = m.match(/VINKO_[A-Z_]+/)?.[0];
  if (code) {
    const k = tMoney("adminMoney.err." + code);
    if (k !== "adminMoney.err." + code) return k;
  }
  if (/permission denied|row-level security/i.test(m)) return tMoney("adminMoney.err.VINKO_NOT_ADMIN");
  return tMoney("adminMoney.err.generic");
}
