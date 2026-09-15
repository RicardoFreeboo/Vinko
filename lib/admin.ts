// Datos del /admin. ALPHA FREEZE: si n=0, se muestra 0 — nunca se rellena ni se
// inventan filas. Sin usuarios reales todavía, todo es 0 / vacío a propósito.
// Cuando Supabase esté cableado, estas funciones leerán conteos reales
// (is_seed=false; plantillas y editorial excluidas de K-factor).

export type Tone = "ok" | "warn" | "unset";

export const FIVE_METRICS = [
  { key: "share", value: "—" },
  { key: "clickjoin", value: "0%" },
  { key: "joinpick", value: "0%" },
  { key: "invporra", value: "0" },
  { key: "segunda", value: "0" },
] as const;

// Bloques de KPIs para dirección/inversores (spec §4). Valores 0/— hasta que
// haya actividad real: la instrumentación ya existe, faltan los usuarios.
export const KPI_BLOCKS = [
  { title: "admin.kpi.growth", rows: [
    ["admin.kpi.dau", "0"], ["admin.kpi.signups", "0"], ["admin.kpi.guestconv", "0%"],
  ] },
  { title: "admin.kpi.retention", rows: [
    ["admin.kpi.d1", "—"], ["admin.kpi.d7", "—"], ["admin.kpi.d30", "—"],
  ] },
  { title: "admin.kpi.virality", rows: [
    ["admin.kpi.kfactor", "—"], ["admin.kpi.sharedpct", "0%"], ["admin.kpi.refs", "0"],
  ] },
  { title: "admin.kpi.content", rows: [
    ["admin.kpi.pools", "0"], ["admin.kpi.creators", "0%"], ["admin.kpi.median", "0"],
  ] },
  { title: "admin.kpi.economy", rows: [
    ["admin.kpi.emitted", "0"], ["admin.kpi.burned", "0"], ["admin.kpi.ratio", "—"],
  ] },
  { title: "admin.kpi.business", rows: [
    ["admin.kpi.affclicks", "0"], ["admin.kpi.premium", "0"], ["admin.kpi.runway", "—"],
  ] },
] as const;

// Health: honesto y REAL. Vercel/OG = ok si esta página renderiza. Supabase por
// env. Sentry activo (DSN inline en el código). Anthropic y cron desde la BD
// (system_health). PostHog = sin configurar hasta que haya clave (honesto).
export function healthChecks(h: { cron_jobs?: number; anthropic?: boolean } = {}): { key: string; tone: Tone }[] {
  const has = (v?: string) => (v && v.length > 0 ? true : false);
  const supa = has(process.env.NEXT_PUBLIC_SUPABASE_URL) && has(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const posthog = has(process.env.NEXT_PUBLIC_POSTHOG_KEY);
  return [
    { key: "admin.health.check.vercel", tone: "ok" },
    { key: "admin.health.check.dominio", tone: "ok" },   // DNS Hostinger → si esto renderiza, resuelve
    { key: "admin.health.check.github", tone: "ok" },    // repo main conectado (CI de léxico + build)
    { key: "admin.health.check.og", tone: "ok" },
    { key: "admin.health.check.supabase", tone: supa ? "ok" : "unset" },
    { key: "admin.health.check.sentry", tone: "ok" },    // DSN EU inline → activo
    { key: "admin.health.check.anthropic", tone: h.anthropic ? "ok" : "unset" },
    { key: "admin.health.check.cron", tone: (h.cron_jobs ?? 0) > 0 ? "ok" : "unset" },
    { key: "admin.health.check.posthog", tone: posthog ? "ok" : "unset" },
  ];
}

// Matcher de SEGURIDAD de contenido (spec de moderación, orden de Ricardo): un
// producto +18 con contenido de usuario en landings públicas necesita filtrar
// contenido ilegal/dañino — no el léxico de marca (eso es el test L5 aparte).
// Los términos disparan REVISIÓN HUMANA + retirada, no bloqueo silencioso.
// NOTA: las categorías graves (explotación infantil) requieren además un
// proveedor especializado (hash-matching tipo PhotoDNA); esta lista es la
// primera capa de detección por texto.
export const MODERATION_CATEGORIES: { key: string; terms: string[] }[] = [
  { key: "violencia", terms: ["asesinato", "asesinar", "matar", "homicidio", "apuñalar", "tiroteo", "masacre", "terrorismo", "atentado", "suicidio", "autolesión", "descuartizar", "linchar"] },
  { key: "menores", terms: ["pederastia", "pedofilia", "abuso infantil", "menor desnudo", "porno infantil", "grooming", "explotación infantil"] },
  { key: "sexual", terms: ["pornografía", "porno", "contenido explícito", "xxx", "prostitución", "zoofilia", "violación"] },
  { key: "drogas", terms: ["cocaína", "heroína", "metanfetamina", "fentanilo", "narcotráfico", "traficar droga", "vender droga", "éxtasis", "cristal"] },
  { key: "ilegal", terms: ["arma de fuego", "explosivo", "bomba casera", "trata de personas", "blanqueo", "documento falso", "hackear cuenta", "datos robados"] },
  { key: "odio", terms: ["limpieza étnica", "genocidio", "apología nazi", "incitación al odio"] },
];

// Compat: la lista de léxico de marca (apuestas) sigue existiendo para el matcher
// de copy pública, pero NO es lo que se vigila en el panel de moderación.
export const BLACKLIST = [
  "apuesta", "apostar", "cuota", "odd", "casino", "betting",
];
