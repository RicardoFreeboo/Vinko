// Edge Function: POST /trend-generate — agente de tendencias de Vinko.
// Convierte señales REALES de actualidad en porras candidatas para la cola de
// revisión humana (topic_proposals). NUNCA publica: eso es publish_proposal.
//
// FUENTES (todas gratuitas y sin clave):
//  1. tracked_entities (catálogo semilla) -> Google News RSS por palabra clave.
//     Es la fuente PRIMARIA: garantiza que las porras hablen de lo que sigue
//     nuestro público (realities, streamers, fútbol, música…).
//  2. Titulares generales de deporte/actualidad, como red de arrastre.
// Se eliminó la ingesta de términos crudos de Google Trends: producían basura
// del tipo "justicia", "emergencia", "liam neeson" (no son eventos resolubles).
//
// GUARDARRAÍLES (§0 del catálogo), aplicados YA EN LA INGESTA, no solo al final:
//  léxico prohibido · veto de cuotas · contenido inseguro · política partidista
//  · menores · criterio de resolución obligatorio · sin difamación.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BANNED = [
  /apuest\w*/i, /apost\w*/i, /\bbet\b/i, /betting/i, /\bwager\w*/i, /\bcuota\w*/i,
  /\bodds?\b/i, /casa de apuestas/i, /\bjackpot\b/i, /\bbote\b/i, /\bcasino\b/i,
  /\bwallet\b/i, /\bcash\b/i, /ganar dinero/i, /dinero real/i, /\bslots?\b/i,
  /tragaperras/i, /ruleta/i,
];
const ODDS = /(\bodds\b|\bcuota|\bspread\b|\bpayout\b|\bhandicap\b|\bmoneyline\b|over\/under|\bbookmaker|\btipster|\b[1-9]\.[0-9]{2}\b)/i;
const UNSAFE = /(asesin|matar\b|mata\b|homicid|apu.alar|tiroteo|masacre|terror|atentad|suicid|autoles|descuartiz|linch|pederast|pedofil|abuso infantil|porno|pornograf|prostituci|zoofil|violaci|envenen|coca.na|hero.na|metanfetam|fentanil|narcotr|traficar|arma de fuego|explosiv|bomba|trata de personas|genocid|nazi|incita.*odio|violent|agred|reyerta|muerto|muere\b|fallec)/i;
// Política partidista FUERA (§0). Solo actualidad neutral y resoluble.
const POLITICA = /(\bpsoe\b|\bpp\b|\bvox\b|\bsumar\b|\bpodemos\b|\berc\b|\bjunts\b|\bbildu\b|s[áa]nchez|feij[óo]o|abascal|ayuso|puigdemont|moncloa|congreso de los diputados|\bsenado\b|elecciones|ministr\w+|gobierno de espa[ñn]a|parlamento|consejo de europa|bruselas|comisi[óo]n europea|eurodiputad|investidura|moci[óo]n de censura|amnist[íi]a|refer[ée]ndum|migrante|inmigra|deportaci|geopol[íi]tic|\bguerra\b|\bejército\b|militar)/i;
// Menores NUNCA como sujeto (§0).
const MENORES = /(\bmenor(es)? de edad\b|\bni[ñn]o(s)?\b|\bni[ñn]a(s)?\b|\badolescent|\binfantil\b|\bcolegio\b|\binstituto\b)/i;
// Opciones de relleno que devuelve a veces el modelo ("Equipo 1", "Opción 2"…).
const PLACEHOLDER = /^(equipo|opci[óo]n|jugador|pareja|concursante|candidat[oa]|persona|participante|team)\s*\d+$/i;

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Un titular sirve como señal; un término suelto ("justicia") no.
function looksLikeEvent(t: string): boolean {
  return t.length >= 25 && t.trim().split(/\s+/).length >= 4;
}

function vetoed(t: string): string | null {
  if (BANNED.some((r) => r.test(t))) return "lexico";
  if (ODDS.test(t)) return "cuotas";
  if (UNSAFE.test(t)) return "seguridad";
  if (POLITICA.test(t)) return "politica";
  if (MENORES.test(t)) return "menores";
  return null;
}

// Decodifica entidades HTML y limpia etiquetas. Sin esto llegaban títulos como
// «Fermín: &quot;Las burlas...&quot;» o «...&lt;br&gt;» hasta la porra.
function decodeTitle(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Parser tolerante: los <title> de 20minutos vienen con salto de línea antes del
// CDATA y la regex anterior no casaba NADA (esa fuente aportaba cero señales).
// Se leen los <item> para no ingerir el <title> del canal ("Daily Search Trends").
function parseFeed(xml: string): string[] {
  let raw = [...xml.matchAll(/<item\b[\s\S]*?<title>([\s\S]*?)<\/title>/g)].map((m) => m[1]);
  if (!raw.length) raw = [...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => m[1]).slice(1);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    // Google News añade " - Medio" al final del titular
    const t = decodeTitle(r).replace(/\s+[-–|]\s+[^-–|]{2,40}$/, "").trim();
    const k = norm(t);
    if (!k || seen.has(k)) continue;
    if (t.length < 12 || t.length > 140) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

async function getFeed(url: string, ms = 5000): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (VinkoAgent)" } });
    return await res.text();
  } finally { clearTimeout(to); }
}

const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es&gl=ES&ceid=ES:es`;

// deno-lint-ignore no-explicit-any
async function seenTopics(admin: any): Promise<Set<string>> {
  const { data } = await admin.from("signals").select("topic")
    .gt("created_at", new Date(Date.now() - 10 * 86400000).toISOString()).limit(800);
  return new Set((data ?? []).map((s: { topic: string }) => norm(s.topic)));
}

// deno-lint-ignore no-explicit-any
async function insertSignal(admin: any, seen: Set<string>, t: string, meta: Record<string, unknown>): Promise<boolean> {
  const k = norm(t);
  if (seen.has(k)) return false;
  if (!looksLikeEvent(t)) return false;
  if (vetoed(t)) return false; // se descarta en la INGESTA, no se encola basura
  const { error } = await admin.from("signals").insert({
    topic: t, status: "new", velocity: 60, ...meta,
  });
  if (error) return false;
  seen.add(k);
  return true;
}

// FUENTE PRIMARIA: el catálogo semilla (tracked_entities) vía Google News.
// deno-lint-ignore no-explicit-any
async function sweepEntities(admin: any, seen: Set<string>, max: number): Promise<number> {
  const { data: ents } = await admin.from("tracked_entities")
    .select("id, nombre, categoria, palabras_clave, last_swept_at")
    .eq("activo", true)
    .order("last_swept_at", { ascending: true, nullsFirst: true })
    .limit(6);
  let n = 0;
  for (const e of ents ?? []) {
    if (n >= max) break;
    const q = (e.palabras_clave?.[0] ?? e.nombre) as string;
    try {
      const titles = parseFeed(await getFeed(gnews(q))).slice(0, 3);
      for (const t of titles) {
        if (n >= max) break;
        if (await insertSignal(admin, seen, t, {
          category: e.categoria, source: "gnews", score: 70,
          raw: { entidad: e.nombre, consulta: q },
        })) n++;
      }
    } catch { /* fuente caída: seguimos */ }
    await admin.from("tracked_entities").update({ last_swept_at: new Date().toISOString() }).eq("id", e.id);
  }
  return n;
}

// Red de arrastre general (deporte + actualidad).
// deno-lint-ignore no-explicit-any
async function sweepNews(admin: any, seen: Set<string>, max: number): Promise<number> {
  const SRC = [
    { url: "https://e00-marca.uecdn.es/rss/portada.xml", cat: "deporte" },
    { url: "https://www.20minutos.es/rss/", cat: "actualidad" },
  ];
  let n = 0;
  for (const s of SRC) {
    if (n >= max) break;
    try {
      for (const t of parseFeed(await getFeed(s.url)).slice(0, 5)) {
        if (n >= max) break;
        if (await insertSignal(admin, seen, t, { category: s.cat, source: "news", score: 55 })) n++;
      }
    } catch { /* seguimos */ }
  }
  return n;
}

const SYSTEM = `Eres el generador de porras de Vinko: conviertes una noticia real en una porra social de puntos virtuales para público español (realities, streamers, fútbol, música, cultura pop).

REGLAS ABSOLUTAS (si incumples alguna, devuelve invalida=true):
- Léxico prohibido: apuesta, apostar, bet, cuota, odds, casa de apuestas, bote, jackpot, casino, ganar dinero. Usa: porra, pronóstico, predicción, puntos.
- RESOLUBLE: debe existir un desenlace objetivo y público. Escribe criterio_de_resolucion diciendo con qué fuente se declara el ganador. Si el desenlace no se puede verificar, invalida=true.
- fecha_cierre SIEMPRE anterior al desenlace, en ISO, y como mucho a 30 días vista.
- Opciones CONCRETAS y excluyentes (nombres reales). Prohibido "Equipo 1", "Opción 2" o rellenos genéricos: si no sabes los nombres reales, invalida=true.
- NADA de política partidista, partidos, elecciones, gobiernos ni geopolítica: invalida=true.
- NUNCA menores como sujeto: invalida=true.
- SIN DIFAMACIÓN: la porra pregunta por un hecho público que ocurrirá y se declarará objetivamente. Jamás por acusaciones, delitos, rumores o la vida privada de nadie: invalida=true.
- Si la noticia es sobre muerte, violencia, delitos o desgracias: invalida=true.
- Preferimos preguntas de pique: quién gana, quién cae, pasa sí o no.

Devuelve SOLO JSON: {"pregunta","opciones":["..."],"fecha_cierre":"ISO","criterio_de_resolucion","categoria","invalida":false}`;

async function withHaiku(key: string, signal: Record<string, unknown>) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(signal) }],
    }),
  });
  const j = await res.json();
  const text = j?.content?.[0]?.text ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : "{}");
}

// Motivo por el que una candidata NO sirve. null = se puede encolar.
function rejectReason(c: {
  pregunta?: string; opciones?: string[]; criterio_de_resolucion?: string; invalida?: boolean;
}): string | null {
  if (c.invalida) return "invalida";
  const p = c.pregunta ?? "";
  const ops = c.opciones ?? [];
  const crit = c.criterio_de_resolucion ?? "";
  if (!p || p.length < 12 || p.length > 140) return "pregunta";
  if (ops.length < 2 || ops.length > 6) return "opciones";
  if (ops.some((o) => !o || PLACEHOLDER.test(o.trim()))) return "opciones_relleno";
  if (new Set(ops.map(norm)).size !== ops.length) return "opciones_repetidas";
  if (!crit || crit.length < 25) return "sin_resolucion";
  const v = vetoed([p, ...ops, crit].join(" "));
  if (v) return v;
  return null;
}

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropic = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const admin = createClient(url, service);

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit) || 6, 12);
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 120) : "";

  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const isCron = secret && req.headers.get("x-cron-secret") === secret;
  if (!isCron) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    let isAdmin = false;
    if (user) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      isAdmin = prof?.role === "admin";
    }
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    // El cooldown sólo frena BARRIDOS repetidos; la búsqueda dirigida nunca se
    // bloquea (antes devolvía silencio y parecía que el buscador no iba).
    if (!topic) {
      const { data: recent } = await admin.from("agent_runs")
        .select("id").eq("kind", "sweep")
        .gt("created_at", new Date(Date.now() - 60000).toISOString()).limit(1);
      if (recent && recent.length) {
        return json({ cooldown: true, created: 0, mensaje: "Espera un minuto entre barridos." });
      }
    }
  }

  const seen = await seenTopics(admin);
  let ingested = 0;

  if (topic) {
    // BÚSQUEDA DIRIGIDA: se buscan NOTICIAS REALES del tema y de ahí salen las
    // señales. Antes se metía el término crudo ("dalas review") y el modelo no
    // tenía nada con lo que trabajar: no salía nada.
    const v = vetoed(topic);
    if (v) return json({ created: 0, error: "tema_vetado", motivo: v });
    try {
      for (const t of parseFeed(await getFeed(gnews(topic))).slice(0, 5)) {
        if (await insertSignal(admin, seen, t, {
          category: "busqueda", source: "search", score: 80, raw: { consulta: topic },
        })) ingested++;
      }
    } catch { /* red caída */ }
    if (!ingested) {
      return json({ created: 0, sin_noticias: true, mensaje: `Sin noticias recientes utilizables sobre "${topic}".` });
    }
  } else {
    ingested += await sweepEntities(admin, seen, Math.ceil(limit * 0.7));
    ingested += await sweepNews(admin, seen, limit - ingested);
  }
  await admin.from("agent_runs").insert({ kind: topic ? "search" : "sweep", topic: topic || null });

  const q = admin.from("signals").select("*").eq("status", "new");
  const { data: signals } = topic
    ? await q.eq("source", "search").order("created_at", { ascending: false }).limit(5)
    : await q.order("created_at", { ascending: false }).limit(limit);

  let created = 0, descartadas = 0;
  const motivos: Record<string, number> = {};
  for (const s of signals ?? []) {
    let cand;
    try {
      cand = anthropic ? await withHaiku(anthropic, s) : null;
    } catch { cand = null; }
    // Sin modelo no se inventan porras de plantilla: sólo generaban ruido.
    const motivo = cand ? rejectReason(cand) : "sin_modelo";
    if (motivo) {
      descartadas++;
      motivos[motivo] = (motivos[motivo] ?? 0) + 1;
      await admin.from("signals").update({ status: "discarded" }).eq("id", s.id);
      continue;
    }
    const { error } = await admin.from("topic_proposals").insert({
      title: String(cand.pregunta).slice(0, 160),
      options: cand.opciones,
      source_url: s.raw?.source_url ?? null,
      category: cand.categoria ?? s.category,
      resolution_criteria: cand.criterio_de_resolucion,
      closes_at: cand.fecha_cierre ?? s.resolution_date,
      score: s.score,
      flags: [],
      lang: s.lang ?? "es",
      kind: "porra",
      signal_id: s.id,
      status: "pending_review",
    });
    if (!error) {
      created++;
      await admin.from("signals").update({ status: "scored" }).eq("id", s.id);
    }
  }
  return json({ created, descartadas, motivos, ingested, used: anthropic ? "haiku" : "ninguno" });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
    },
  });
}
