// Helpers compartidos de las imágenes Open Graph (/p/[slug] y /u/[handle]).
// Sin JSX: colores, ajuste de texto, formato y lectura de datos con el cliente
// ANÓNIMO (exactamente lo que ve el scraper de WhatsApp: sin cookies).
// Regla: cualquier fallo de datos degrada a "sin termómetro", nunca a error.
import { createClient } from "@supabase/supabase-js";
import { getPorraBySlug, type Porra } from "@/lib/porras";

export const OG_SIZE = { width: 1200, height: 630 } as const;

// Caché de la PNG (F-02: 10 min). `revalidate = 600` en la ruta regenera en
// servidor; este header cubre CDN/navegador. El `?v=` de la URL NO cambia la
// imagen: solo obliga al scraper (WhatsApp/FB) a volver a pedirla.
export const OG_REVALIDATE = 600;
export const OG_CACHE_CONTROL =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=600";

// Termómetro solo con ≥ 5 picks; por debajo, "Sé el primero".
export const MIN_PICKS_THERMO = 5;

// Paleta real de Vinko (verde-negro terminal, verde/oro).
export const OG_COLORS = {
  bg: "#0c1011",
  ink2: "#141a1b",
  ink3: "#1c2628",
  line: "#26312f",
  cream: "#f4f1e9",
  muted: "#8ba398",
  muted2: "#5f7169",
  win: "#1fe07a",
  gold: "#ffc23d",
} as const;
export const OG_BG_IMAGE =
  "radial-gradient(60% 45% at 50% 0%, rgba(31,224,122,0.16), transparent 60%), " +
  "radial-gradient(55% 45% at 95% 100%, rgba(255,194,61,0.13), transparent 60%)";
export const OG_ACCENT = [
  OG_COLORS.win, OG_COLORS.gold, OG_COLORS.win, OG_COLORS.gold, OG_COLORS.win, OG_COLORS.gold,
];
export const OG_LETTER = ["A", "B", "C", "D", "E", "F"];

// Versión para `?v=`: cubo de 10 min alineado con `revalidate`. Sin consulta.
export function ogVersion(now: number = Date.now()): string {
  return String(Math.floor(now / (OG_REVALIDATE * 1000)));
}

// ---------- texto ----------

/** Corte por palabras a `maxChars` por línea (palabras largas se parten). */
export function wrapLines(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (let w of words) {
    while (w.length > maxChars) {
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export type FitTitle = { fontSize: number; lines: string[]; lineHeight: number; truncated: boolean };

/**
 * Elige el mayor tamaño de fuente con el que la pregunta cabe en ≤ `maxLines`
 * y en `maxHeight` px. Estimación por ancho medio de carácter (Noto Sans);
 * la ruta añade `lineClamp` como red de seguridad.
 */
export function fitTitle(
  text: string,
  {
    maxWidth = 1088,
    maxHeight = 260,
    maxLines = 3,
    sizes = [76, 68, 60, 54, 48, 42, 36],
    charW = 0.54,
    lineHeight = 1.12,
  }: { maxWidth?: number; maxHeight?: number; maxLines?: number; sizes?: number[]; charW?: number; lineHeight?: number } = {},
): FitTitle {
  const clean = text.replace(/\s+/g, " ").trim();
  for (const fontSize of sizes) {
    const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * charW)));
    const lines = wrapLines(clean, maxChars);
    if (lines.length <= maxLines && lines.length * fontSize * lineHeight <= maxHeight) {
      return { fontSize, lines, lineHeight, truncated: false };
    }
  }
  // Ni al mínimo: se recorta con puntos suspensivos.
  const fontSize = sizes[sizes.length - 1];
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * charW)));
  const lines = wrapLines(clean, maxChars).slice(0, maxLines);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > maxChars - 1 ? last.slice(0, maxChars - 1).trimEnd() + "…" : last + "…";
  }
  return { fontSize, lines, lineHeight, truncated: true };
}

/** Filas que ocuparán las píldoras de opciones (estimación para reservar alto). */
export function estimatePillRows(
  labels: string[],
  fontSize: number,
  maxWidth: number,
  { charW = 0.55, extra = 100, gap = 14 }: { charW?: number; extra?: number; gap?: number } = {},
): number {
  let rows = labels.length ? 1 : 0;
  let x = 0;
  for (const l of labels) {
    const w = Math.min(maxWidth, l.length * fontSize * charW + extra);
    if (x > 0 && x + gap + w > maxWidth) { rows++; x = w; }
    else x = x > 0 ? x + gap + w : w;
  }
  return rows;
}

// ---------- números ----------

/** Porcentaje entero (0–100) de `n` sobre `total`; 0 si no hay total. */
export function pctOf(n: number, total: number): number {
  if (!total || total <= 0 || !n || n <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((n * 100) / total)));
}
export function fmtPct(n: number, total: number): string {
  return `${pctOf(n, total)}%`;
}
/** Entero con separador de miles español (1.250). */
export function fmtInt(n: number): string {
  return new Intl.NumberFormat("es-ES").format(Math.max(0, Math.floor(n || 0)));
}
export function initials(handle: string): string {
  return handle.replace(/^@+/, "").slice(0, 2).toUpperCase() || "V";
}

// Nivel n = XP acumulado 100·n·(n-1)/2 (misma fórmula que components/VinkosStreak).
export function levelFromXp(xp: number): number {
  const x = Math.max(0, Math.floor(xp || 0));
  const req = (n: number) => (100 * n * (n - 1)) / 2;
  let n = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * x) / 100)) / 2));
  while (req(n + 1) <= x) n++;
  while (n > 1 && req(n) > x) n--;
  return n;
}

export const DIVISIONS = ["bronce", "plata", "oro", "diamante", "leyenda"] as const;
export type Division = (typeof DIVISIONS)[number];
export function divisionKey(d: string | null | undefined): Division {
  return (DIVISIONS as readonly string[]).includes(d ?? "") ? (d as Division) : "bronce";
}

// ---------- datos (cliente anónimo) ----------

const UUID = /^[0-9a-f-]{36}$/;

function anon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type OgTally = { option_id: string; n: number };
export type OgCreator = { handle: string; avatar_url: string | null };
export type PorraOgData = {
  porra: Porra | null;
  tallies: OgTally[];
  total: number; // participantes = picks (uno por persona y porra)
  creator: OgCreator | null; // null en editoriales (Vinko oficial) y plantillas
};

/** Porra + conteos por opción + creador. Nunca lanza: sin datos → sin termómetro. */
export async function fetchPorraOgData(slug: string): Promise<PorraOgData> {
  let porra: Porra | null = null;
  try { porra = await getPorraBySlug(slug); } catch { porra = null; }
  const empty: PorraOgData = { porra, tallies: [], total: 0, creator: null };
  if (!porra || porra.status === "taken_down") return empty;
  const sb = anon();
  const real = !porra.is_template && UUID.test(porra.id);
  if (!sb || !real) return empty;
  try {
    const [tal, cre] = await Promise.all([
      sb.from("porra_tallies").select("option_id, n").eq("porra_id", porra.id),
      porra.source === "user" && porra.created_by
        ? sb.from("profiles").select("handle, avatar_url").eq("id", porra.created_by).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const tallies = (tal.error ? [] : (tal.data ?? [])) as OgTally[];
    const total = tallies.reduce((s, x) => s + (Number(x.n) > 0 ? Math.floor(Number(x.n)) : 0), 0);
    const c = (cre.error ? null : cre.data) as { handle?: string; avatar_url?: string | null } | null;
    const creator = c && c.handle ? { handle: c.handle, avatar_url: c.avatar_url ?? null } : null;
    return { porra, tallies, total, creator };
  } catch {
    return empty;
  }
}

export type ProfileOgData = {
  handle: string;
  avatar_url: string | null;
  xp: number;
  marcador_total: number; // Puntería
  division: Division;
  title: string | null;
  streak_days: number;
  played: number;
  hits: number;
};

/** Perfil público + estadísticas (profile_stats es anon). null si no existe. */
export async function fetchProfileOgData(handle: string): Promise<ProfileOgData | null> {
  const h = handle.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(h)) return null;
  const sb = anon();
  if (!sb) return null;
  try {
    const { data: p } = await sb
      .from("profiles")
      .select("id, handle, avatar_url, xp, marcador_total, division, title, streak_days")
      .eq("handle", h)
      .maybeSingle();
    if (!p) return null;
    let played = 0, hits = 0;
    try {
      const { data: s } = await sb.rpc("profile_stats", { p_user: p.id });
      const st = (s ?? {}) as { played?: number; hits?: number };
      played = Math.max(0, Number(st.played ?? 0) || 0);
      hits = Math.max(0, Number(st.hits ?? 0) || 0);
    } catch { /* sin stats: se muestra solo Puntería y nivel */ }
    return {
      handle: p.handle,
      avatar_url: p.avatar_url ?? null,
      xp: Number(p.xp ?? 0) || 0,
      marcador_total: Number(p.marcador_total ?? 0) || 0,
      division: divisionKey(p.division),
      title: p.title ?? null,
      streak_days: Number(p.streak_days ?? 0) || 0,
      played,
      hits,
    };
  } catch {
    return null;
  }
}

// ---------- avatar ----------

/** URL ráster del avatar: DiceBear sirve PNG (el SVG no se incrusta en Satori). */
export function avatarPngUrl(url: string | null | undefined, size = 128): string | null {
  if (!url || !/^https:\/\//.test(url)) return null;
  const m = /^https:\/\/api\.dicebear\.com\/9\.x\/([a-z0-9-]+)\/svg\?(.*)$/.exec(url);
  if (m) return `https://api.dicebear.com/9.x/${m[1]}/png?${m[2]}&size=${size}`;
  return url;
}

/**
 * Descarga el avatar como data URI (png/jpeg) con timeout y tope de bytes.
 * Cualquier fallo → null (iniciales). Así la OG nunca depende de un tercero.
 */
export async function fetchAvatarDataUri(
  url: string | null | undefined,
  { timeoutMs = 1000, maxBytes = 200_000 }: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<string | null> {
  const src = avatarPngUrl(url);
  if (!src) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(src, { signal: ctrl.signal, headers: { accept: "image/png,image/jpeg" } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (type !== "image/png" && type !== "image/jpeg") return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > maxBytes) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
