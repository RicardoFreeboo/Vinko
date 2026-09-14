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

// Health: honesto. Netlify/OG = ok (si esta página renderiza, el sitio sirve y
// la ruta OG está desplegada). Servicios sin variables de entorno = SIN
// CONFIGURAR. Cron aún no activo (PASO 5c).
export function healthChecks(): { key: string; tone: Tone }[] {
  const has = (v?: string) => (v && v.length > 0 ? true : false);
  const supa = has(process.env.NEXT_PUBLIC_SUPABASE_URL) && has(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const posthog = has(process.env.NEXT_PUBLIC_POSTHOG_KEY);
  const sentry = has(process.env.SENTRY_DSN);
  return [
    { key: "admin.health.check.netlify", tone: "ok" },
    { key: "admin.health.check.og", tone: "ok" },
    { key: "admin.health.check.supabase", tone: supa ? "ok" : "unset" },
    { key: "admin.health.check.posthog", tone: posthog ? "warn" : "unset" }, // configurado pero sin eventos aún
    { key: "admin.health.check.sentry", tone: sentry ? "ok" : "unset" },
    { key: "admin.health.check.cron", tone: "unset" },
  ];
}

// Lista negra vigilada por el matcher de moderación (copy público, del freeze).
export const BLACKLIST = [
  "apuesta", "apostar", "cuota", "odd", "cash", "wallet", "prediction market",
  "Polymarket", "Kalshi", "dinero real", "puntos o dinero", "casino", "betting",
  "recargar", "comprar puntos",
];
