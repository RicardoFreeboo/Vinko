// Edge Function: POST /trend-generate — agente de tendencias de Vinko. v4 (F1 del motor, 27-oct-2026)
// Convierte señales REALES de actualidad en predicciones candidatas para la cola
// de revisión humana (topic_proposals). NUNCA publica: eso es publish_proposal
// desde /admin/temas (Nivel B; el publicador del plan llega en la F4).
//
// MERCADO: todo va por mercado (body.market, por defecto CO): catálogo
// (tracked_entities.market = mercado o GLOBAL), noticias con la región del
// mercado y prompt con su público, zona horaria y sustantivo (tabla markets).
//
// FUENTE (F1): tracked_entities → Google News RSS por palabra clave, con Bing
// de respaldo. El radar (Trends, YouTube, X…) llega en la F3.
//
// INTERRUPTOR: el cron solo trabaja con remote_config.content_engine.enabled y
// sin kill_switch (la programación del cron ya lo comprueba en 0074; esto es la
// segunda llave). Un admin sí puede buscar a mano con el motor apagado: solo
// llena la cola de revisión.
//
// GUARDARRAÍLES (./filtros.ts, puros y testados en Node), en la ingesta y otra
// vez sobre la salida del modelo: léxico prohibido · veto de cuotas · azar ·
// contenido inseguro · conflicto armado · MENORES · lo electoral (modo
// electoral) · YA OCURRIÓ · FECHA REAL · entidad nombrada · DUPLICADOS ·
// consenso > 80 % · nota mínima. La política entra, marcada para el revisor.
//
// RASTRO: cada pasada deja en agent_runs conteos, errores, coste estimado y
// duración; con el tope mensual de Anthropic gastado, no se llama al modelo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import {
  type Candidata, type Huella, type PesosNota,
  CATEGORIAS, TIPOS_FUENTE, TZ_DEFECTO,
  categoriaCorta, cierreDesde, coincideEntidad, diaLocal, esPolitica, esRepetida, flagsSuaves, huella,
  looksLikeEvent, norm, nota, parseFechaLocal, rejectReason, resolucionDesde, tieneFechaEnTexto, vetoed, yaOcurrido,
} from "./filtros.ts";

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

// Parser tolerante: se leen los <item> (nunca el <title> del canal) y se
// captura <description> (nombres y fechas), <link> (fuente para el revisor)
// y <pubDate> (para convertir "este domingo" en una fecha real).
type Item = { t: string; d: string; link: string | null; pub: string | null };
function parseFeed(xml: string): Item[] {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)].map((m) => m[0]);
  const out: Item[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const tm = b.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (!tm) continue;
    // Google News añade " - Medio" al final del titular
    const t = decodeTitle(tm[1]).replace(/\s+[-–|]\s+[^-–|]{2,40}$/, "").trim();
    const dm = b.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i);
    const d = dm ? decodeTitle(dm[1]).slice(0, 400) : "";
    const lm = b.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
    const link = lm ? decodeTitle(lm[1]).slice(0, 500) : null;
    const pm = b.match(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i);
    const pubTs = pm ? Date.parse(decodeTitle(pm[1])) : NaN;
    const pub = Number.isNaN(pubTs) ? null : new Date(pubTs).toISOString();
    const k = norm(t);
    if (!k || seen.has(k)) continue;
    if (t.length < 12 || t.length > 140) continue;
    seen.add(k);
    out.push({ t, d, link: link && /^https?:\/\//i.test(link) ? link : null, pub });
  }
  return out;
}

async function getFeed(url: string, ms = 5000): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (VinkoAgent)" } });
    // Decodificación UTF-8 explícita: Bing no declara bien el charset y los
    // acentos llegaban rotos ("vÃ­deos", "MÃ³stoles").
    return new TextDecoder("utf-8").decode(await res.arrayBuffer());
  } finally { clearTimeout(to); }
}

// Región de las noticias por mercado (verificada en F0, 27-oct). GLOBAL se lee
// con la del público de lanzamiento.
type Region = { hl: string; gl: string; ceid: string; cc: string; setlang: string };
const REGIONES: Record<string, Region> = {
  CO: { hl: "es-419", gl: "CO", ceid: "CO:es-419", cc: "CO", setlang: "es" },
};
const region = (m: string) => REGIONES[m] ?? REGIONES.CO;
const gnews = (q: string, m: string) => {
  const r = region(m);
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${r.hl}&gl=${r.gl}&ceid=${r.ceid}`;
};
// Respaldo: Bing News RSS (mismo formato <item><title><description>).
const bnews = (q: string, m: string) => {
  const r = region(m);
  return `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=${r.setlang}&cc=${r.cc}&qft=sortbydate%3d%221%22`;
};

// Google bloquea IPs de servidor tras muchas peticiones (503 "Sorry…") y el
// agente se quedaba a 0 sin avisar. Se prueba Google y, si no da noticias,
// Bing. Devuelve los items y qué fuente respondió.
async function fetchNews(q: string, m: string): Promise<{ items: Item[]; via: string }> {
  for (const [via, url] of [["google", gnews(q, m)], ["bing", bnews(q, m)]] as const) {
    try {
      const items = parseFeed(await getFeed(url));
      if (items.length) return { items, via };
    } catch { /* probamos la siguiente fuente */ }
  }
  return { items: [], via: "ninguna" };
}

// deno-lint-ignore no-explicit-any
async function seenTopics(admin: any): Promise<Set<string>> {
  const { data } = await admin.from("signals").select("topic")
    .gt("created_at", new Date(Date.now() - 10 * 86400000).toISOString()).limit(800);
  return new Set((data ?? []).map((s: { topic: string }) => norm(s.topic)));
}

type Entidad = { nombre: string; claves: string[] };
// Estado de la ingesta: titulares ya vistos, motivos de descarte (se devuelven
// para que el admin vea por qué un barrido dio pocas), errores para agent_runs,
// y las reglas del mercado.
type Ingesta = { seen: Set<string>; descartes: Record<string, number>; errores: string[]; market: string; electoral: boolean };
function cuenta(m: Record<string, number>, k: string) { m[k] = (m[k] ?? 0) + 1; }

// Noticias de más de 7 días: Google News mezcla piezas de hace semanas (F0) y
// no traen desenlaces futuros.
const MAX_EDAD_MS = 7 * 86400_000;

// deno-lint-ignore no-explicit-any
async function insertSignal(admin: any, ing: Ingesta, it: Item, meta: Record<string, unknown>, entidad?: Entidad): Promise<boolean> {
  const k = norm(it.t);
  if (ing.seen.has(k)) { cuenta(ing.descartes, "vista"); return false; }
  if (it.pub && Date.now() - Date.parse(it.pub) > MAX_EDAD_MS) { cuenta(ing.descartes, "vieja"); return false; }
  if (!looksLikeEvent(it.t)) { cuenta(ing.descartes, "no_evento"); return false; }
  // Se veta sobre titular + contexto: lo delicado venía en la descripción
  // mientras el titular parecía neutro. Menores incluidos.
  const v = vetoed(`${it.t} ${it.d}`, { electoral: ing.electoral });
  if (v) { cuenta(ing.descartes, v); return false; }
  // Titular que ya cuenta el desenlace: no gastamos modelo en él.
  if (yaOcurrido(it.t, it.d)) { cuenta(ing.descartes, "ya_ocurrido"); return false; }
  // La noticia tiene que hablar de la entidad que buscábamos (Google devuelve
  // "relacionados" que no lo son).
  if (entidad && !coincideEntidad(it.t, entidad.nombre, entidad.claves)) { cuenta(ing.descartes, "sin_entidad"); return false; }
  const raw = { ...(meta.raw as Record<string, unknown> ?? {}), titular: it.t, contexto: it.d, source_url: it.link, publicado: it.pub };
  // external_id deduplica la misma noticia entre barridos (índice único de
  // 0074). La búsqueda manual no lo pone: si pides un tema, se regenera.
  const { error } = await admin.from("signals").insert({
    topic: it.t, status: "new", velocity: 60, ...meta, raw,
    market: ing.market, source_kind: "news",
    external_id: meta.source === "search" ? null : (it.link ?? k),
    observed_at: it.pub ?? new Date().toISOString(),
  });
  if (error) { cuenta(ing.descartes, error.code === "23505" ? "vista" : "insert"); return false; }
  ing.seen.add(k);
  return true;
}

// FUENTE PRIMARIA: el catálogo del mercado (y el GLOBAL) vía Google News / Bing.
// deno-lint-ignore no-explicit-any
async function sweepEntities(admin: any, ing: Ingesta, max: number): Promise<number> {
  const { data: ents } = await admin.from("tracked_entities")
    .select("id, nombre, categoria, palabras_clave, aliases, last_swept_at")
    .eq("activo", true)
    .in("market", [ing.market, "GLOBAL"])
    .order("last_swept_at", { ascending: true, nullsFirst: true })
    .limit(10);
  let n = 0;
  for (const e of ents ?? []) {
    if (n >= max) break;
    // Rota entre todas las palabras clave: usando siempre la primera, Google
    // News devolvía los mismos titulares y el deduplicador los tiraba todos.
    const claves = (e.palabras_clave?.length ? e.palabras_clave : [e.nombre]) as string[];
    const q = claves[Math.floor(Math.random() * claves.length)];
    try {
      const { items, via } = await fetchNews(q, ing.market);
      for (const it of items.slice(0, 4)) {
        if (n >= max) break;
        if (await insertSignal(admin, ing, it, {
          category: e.categoria, source: via === "bing" ? "bing" : "gnews", score: 70, entity_id: e.id,
          raw: { entidad: e.nombre, consulta: q },
        }, { nombre: e.nombre, claves: [...claves, ...((e.aliases ?? []) as string[])] })) n++;
      }
    } catch (err) {
      ing.errores.push(`noticias ${e.nombre}: ${String(err).slice(0, 160)}`);
    }
    await admin.from("tracked_entities").update({ last_swept_at: new Date().toISOString() }).eq("id", e.id);
  }
  return n;
}

type Mercado = { code: string; name: string; tz: string; noun: string; electoral_mode: boolean };

// Prompt por mercado: público, zona horaria y sustantivo salen de `markets`.
function sistema(mk: Mercado): string {
  return `Eres el generador de Vinko para ${mk.name}: conviertes UNA noticia real en una ${mk.noun} social de puntos virtuales para el público de ${mk.name} (fútbol, realities, música y farándula, deportes, actualidad y política).

Recibes un JSON con: titular, contexto (extracto de la noticia), entidad (lo que vigilamos), publicado (fecha de la noticia), hoy (fecha actual) y zona (zona horaria del mercado).

REGLAS ABSOLUTAS (si incumples alguna, devuelve invalida=true):
- Léxico prohibido: apuesta, apostar, bet, cuota, odds, casa de apuestas, bote, jackpot, casino, ganar dinero, lotería, sorteo, rifa. Usa: ${mk.noun}, pronóstico, puntos.
- FUTURO, no pasado: la pregunta trata de un desenlace que TODAVÍA NO ha ocurrido. Si el titular o el contexto ya cuentan el resultado (quién ganó, quién salió, cómo terminó, quién es campeón), pon ya_ocurrido=true e invalida=true. Jamás preguntes "quién fue", "quién ganó" ni "quién ha sido".
- FECHA REAL, nunca estimada: fecha_evento es cuándo empieza el desenlace TAL COMO APARECE en el material (partido, gala, ceremonia, votación, estreno, carrera). Convierte expresiones relativas ("este domingo", "mañana", "el jueves") usando la fecha de publicado. Si el material NO dice cuándo ocurre, deja fecha_evento vacío e invalida=true. Prohibido suponer "la próxima fecha" o "la semana que viene".
  Formato: "YYYY-MM-DDTHH:MM" en hora de ${mk.name} (${mk.tz}) si el texto da la hora; "YYYY-MM-DD" si solo da el día.
- fecha_resultado: cuándo se sabe públicamente el desenlace (final del partido, fin de la gala, anuncio oficial). Mismo formato. Nunca antes de fecha_evento.
- MENORES: si el protagonista tiene menos de 18 años (sub-17, juvenil, cadete, infantil, "a sus 16 años", colegio) → invalida=true. Nunca un menor como sujeto.
- RESOLUBLE: debe existir un desenlace objetivo y público. criterio_de_resolucion dice exactamente qué cuenta como ganador y según qué fuente (Dimayor, web oficial, acta, transmisión oficial, comunicado). fuente_resolucion nombra esa fuente. tipo_fuente: "proveedor_oficial" (organizador o federación), "web_oficial" (web o canal oficial del evento) o "prensa". Si no se puede verificar, invalida=true.
- Opciones: de 2 a 4, CONCRETAS (nombres propios REALES que aparezcan en el titular o en el contexto), de 40 caracteres como mucho cada una. Prohibido inventar y prohibido el relleno ("Equipo 1", "Participante A", "Opción B"). Mejor una binaria con dos desenlaces concretos ("Sí, antes del domingo" / "No") que una lista inventada.
- TIENE QUE DIVIDIR: reparto_esperado es el porcentaje (0–100) del público que crees que elegiría la PRIMERA opción. Si una opción es casi segura (más del 80 %), invalida=true.
- POLÍTICA: permitida si pregunta por un hecho público futuro y verificable (una votación del Congreso, un nombramiento, una decisión de una corte); pon es_politica=true. Si trata de elecciones, candidatos o encuestas, pon es_electoral=true.${mk.electoral_mode ? " MODO ELECTORAL ACTIVO: nada sobre elecciones, candidatos ni encuestas → invalida=true." : ""}
- SIN DIFAMACIÓN: la pregunta trata de un hecho público que ocurrirá y se declarará objetivamente. Jamás de acusaciones, delitos, rumores o la vida privada de nadie: invalida=true.
- Si la noticia es sobre muerte, violencia, delitos, conflicto armado o desgracias: invalida=true.
- categoria: "futbol", "reality", "musica_farandula" u "otros".
- confianza: de 0 a 1, cuánto confías en que la pregunta se podrá resolver tal como está escrita.
- Preferimos preguntas de pique: quién gana, quién cae, pasa sí o no.

Responde solo con el JSON del esquema.`;
}

// Salida estructurada: la API la ajusta a este esquema; rejectReason valida
// después rangos y longitudes (el esquema no los expresa).
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pregunta", "opciones", "categoria", "fecha_evento", "fecha_resultado", "ya_ocurrido",
    "criterio_de_resolucion", "fuente_resolucion", "tipo_fuente", "reparto_esperado", "confianza",
    "es_politica", "es_electoral", "invalida"],
  properties: {
    pregunta: { type: "string" },
    opciones: { type: "array", items: { type: "string" } },
    categoria: { type: "string", enum: [...CATEGORIAS] },
    fecha_evento: { type: "string", description: "YYYY-MM-DDTHH:MM o YYYY-MM-DD; vacío si el material no lo dice" },
    fecha_resultado: { type: "string", description: "YYYY-MM-DDTHH:MM o YYYY-MM-DD; vacío si no se sabe" },
    ya_ocurrido: { type: "boolean" },
    criterio_de_resolucion: { type: "string" },
    fuente_resolucion: { type: "string" },
    tipo_fuente: { type: "string", enum: [...TIPOS_FUENTE] },
    reparto_esperado: { type: "number" },
    confianza: { type: "number" },
    es_politica: { type: "boolean" },
    es_electoral: { type: "boolean" },
    invalida: { type: "boolean" },
  },
};

type Material = { titular: string; contexto: string; entidad: string | null; categoria: string | null; publicado: string | null; hoy: string; zona: string };
type Uso = { entrada: number; salida: number };

async function generar(client: Anthropic, modelo: string, system: string, m: Material, uso: Uso): Promise<{ cand: Candidata | null; motivo?: string }> {
  const res = await client.messages.create({
    model: modelo,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: JSON.stringify(m) }],
    // Haiku 5.5 piensa por defecto: esfuerzo bajo, que esto es extraer y redactar.
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
  });
  uso.entrada += res.usage?.input_tokens ?? 0;
  uso.salida += res.usage?.output_tokens ?? 0;
  if (res.stop_reason === "refusal") return { cand: null, motivo: "rechazo_modelo" };
  if (res.stop_reason === "max_tokens") return { cand: null, motivo: "corte_modelo" };
  const bloque = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!bloque) return { cand: null, motivo: "sin_respuesta" };
  return { cand: JSON.parse(bloque.text) as Candidata };
}

// Huellas de lo que ya existe: cola de 14 días (pendientes, programadas y
// publicadas) y porras abiertas. Contra esto se deduplica cada candidata nueva.
// deno-lint-ignore no-explicit-any
async function huellasPrevias(admin: any, tz: string): Promise<Huella[]> {
  const out: Huella[] = [];
  const desde = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: previas } = await admin.from("topic_proposals")
    .select("title, options, closes_at, signals(raw)")
    .in("status", ["pending_review", "scheduled", "published"])
    .gt("created_at", desde).limit(1000);
  for (const p of previas ?? []) {
    const raw = (Array.isArray(p.signals) ? p.signals[0]?.raw : p.signals?.raw) as Record<string, unknown> | undefined;
    out.push(huella(String(p.title ?? ""), (p.options ?? []) as string[], (raw?.entidad as string) ?? null, p.closes_at, tz));
  }
  const { data: abiertas } = await admin.from("porras")
    .select("title, closes_at, porra_options(label)")
    .eq("status", "open").eq("is_template", false)
    .gt("closes_at", new Date().toISOString()).limit(800);
  for (const p of abiertas ?? []) {
    const ops = ((p.porra_options ?? []) as { label: string }[]).map((o) => o.label);
    out.push(huella(String(p.title ?? ""), ops, null, p.closes_at, tz));
  }
  return out;
}

// remote_config.content_engine (0074). Todo opcional: sin la migración, el
// motor cuenta como apagado y se usan los valores por defecto.
type Motor = {
  enabled?: boolean; kill_switch?: boolean;
  models?: { generator?: string };
  prices_usd_per_mtok?: Record<string, [number, number]>;
  sources?: Record<string, boolean>;
  budgets_usd_month?: Record<string, number>;
  score_weights?: PesosNota;
  discard_consensus_over?: number;
  max_per_entity_day?: number;
  defaults?: { category_weights?: Record<string, number> };
};
const MODELO_DEFECTO = "claude-haiku-5-5";
const PESOS_CATEGORIA = { futbol: 0.35, reality: 0.30, musica_farandula: 0.20, otros: 0.15 };

// deno-lint-ignore no-explicit-any
async function cargarConfig(admin: any, market: string): Promise<{ motor: Motor; umbral: number; mk: Mercado }> {
  const [{ data: cfg }, { data: mk }] = await Promise.all([
    admin.from("remote_config").select("key, value").in("key", ["content_engine", "trend_agent"]),
    admin.from("markets").select("*").eq("code", market).maybeSingle(),
  ]);
  const val = (k: string) => ((cfg ?? []) as { key: string; value: unknown }[]).find((r) => r.key === k)?.value ?? {};
  return {
    motor: val("content_engine") as Motor,
    umbral: Number((val("trend_agent") as { score_threshold?: number }).score_threshold ?? 60),
    mk: {
      code: market,
      name: mk?.name ?? "Colombia",
      tz: mk?.tz ?? TZ_DEFECTO,
      noun: mk?.noun ?? "predicción",
      electoral_mode: mk?.electoral_mode === true,
    },
  };
}

// Coste estimado de Anthropic en el mes en curso (UTC), sumado de agent_runs.
// deno-lint-ignore no-explicit-any
async function gastoMes(admin: any): Promise<number> {
  const d = new Date();
  const desde = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  const { data } = await admin.from("agent_runs").select("cost_usd").gte("created_at", desde).limit(5000);
  return ((data ?? []) as { cost_usd: number | null }[]).reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
}

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const t0 = Date.now();
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const admin = createClient(url, service);

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit) || 18, 30);
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 120) : "";
  const market = typeof body.market === "string" && /^[A-Z]{2,6}$/.test(body.market) ? body.market : "CO";
  // RENOVAR: ignora el deduplicador de titulares ya vistos. La búsqueda dirigida
  // también lo ignora: si pides un tema a propósito, se regenera aunque ya se
  // hubiera leído esa noticia (antes devolvía 0 y la pantalla se quedaba vacía).
  const force = body.force === true;

  // DIAGNÓSTICO (solo con secreto de cron): qué recibe el SERVIDOR de Google
  // News / Bing para el mercado y qué diría cada filtro de la muestra.
  if (body.debug === true && Deno.env.get("CRON_SECRET") && req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET")) {
    const qd = typeof body.topic === "string" && body.topic ? body.topic : "Millonarios";
    try {
      const out: Record<string, unknown> = {};
      for (const [via, u] of [["google", gnews(qd, market)], ["bing", bnews(qd, market)]] as const) {
        const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (VinkoAgent)" } });
        const txt = await r.text();
        const its = parseFeed(txt);
        out[via] = {
          status: r.status, bytes: txt.length, items: its.length,
          muestra: its.slice(0, 3).map((i) => ({
            t: i.t, publicado: i.pub, veto: vetoed(`${i.t} ${i.d}`), ya_ocurrido: yaOcurrido(i.t, i.d),
            fecha_en_texto: tieneFechaEnTexto(`${i.t} ${i.d}`), entidad: coincideEntidad(i.t, qd),
          })),
        };
      }
      return json({ debug: true, version: 4, market, consulta: qd, ...out });
    } catch (e) { return json({ debug: true, error: String(e) }); }
  }

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

  const { motor, umbral, mk } = await cargarConfig(admin, market);
  // Segunda llave del interruptor: el cron solo trabaja con el motor encendido
  // y la fuente de noticias activa.
  if (isCron && (motor.enabled !== true || motor.kill_switch === true || motor.sources?.news === false)) {
    return json({ version: 4, skipped: true, market, motivo: motor.kill_switch ? "kill_switch" : "motor_apagado" });
  }

  const { data: run } = await admin.from("agent_runs")
    .insert({ kind: topic ? "search" : "sweep", topic: topic || null, market }).select("id").single();

  const ing: Ingesta = {
    seen: force || topic ? new Set<string>() : await seenTopics(admin),
    descartes: {}, errores: [], market, electoral: mk.electoral_mode,
  };
  let ingested = 0;

  if (topic) {
    // BÚSQUEDA DIRIGIDA: se buscan NOTICIAS REALES del tema y de ahí salen las
    // señales. El tema hace de entidad: el titular tiene que nombrarlo.
    const v = vetoed(topic, { electoral: mk.electoral_mode });
    if (v) return json({ created: 0, error: "tema_vetado", motivo: v });
    try {
      for (const it of (await fetchNews(topic, market)).items.slice(0, 6)) {
        if (await insertSignal(admin, ing, it, {
          category: "busqueda", source: "search", score: 80,
          raw: { consulta: topic },
        }, { nombre: topic, claves: [] })) ingested++;
      }
    } catch (err) { ing.errores.push(`noticias ${topic}: ${String(err).slice(0, 160)}`); }
    if (!ingested) {
      return json({ created: 0, sin_noticias: true, ingesta_descartes: ing.descartes, mensaje: `Sin noticias recientes utilizables sobre "${topic}".` });
    }
  } else {
    // SOLO el catálogo: la red general de titulares metía política, deportes
    // irrelevantes y listículos sin desenlace (el radar de la F3 lo sustituye).
    ingested += await sweepEntities(admin, ing, limit);
  }

  const q = admin.from("signals").select("*").eq("status", "new").eq("market", market);
  const { data: signals } = topic
    ? await q.eq("source", "search").order("created_at", { ascending: false }).limit(8)
    : await q.order("created_at", { ascending: false }).limit(limit);

  let created = 0, descartadas = 0, repetidas = 0;
  const motivos: Record<string, number> = {};
  const previas = await huellasPrevias(admin, mk.tz);
  const now = Date.now();
  const hoy = diaLocal(new Date(now).toISOString(), mk.tz) ?? new Date(now).toISOString().slice(0, 10);
  const inicioHoy = new Date(parseFechaLocal(hoy, mk.tz)?.ts ?? now).toISOString();

  // Lo que ya hay hoy en el mercado: cupo por entidad (máx. 3 al día) y mezcla
  // de categorías para la nota.
  const { data: deHoy } = await admin.from("topic_proposals")
    .select("category, signals(entity_id)")
    .eq("market", market).in("status", ["pending_review", "scheduled", "published"])
    .gte("created_at", inicioHoy).limit(1000);
  const porEntidad: Record<string, number> = {};
  const porCategoria: Record<string, number> = {};
  for (const p of (deHoy ?? []) as { category: string | null; signals: { entity_id: string | null } | { entity_id: string | null }[] | null }[]) {
    const sg = Array.isArray(p.signals) ? p.signals[0] : p.signals;
    if (sg?.entity_id) cuenta(porEntidad, sg.entity_id);
    cuenta(porCategoria, p.category ?? "otros");
  }
  const maxEntidad = Number(motor.max_per_entity_day ?? 3);
  const pesosCategoria = motor.defaults?.category_weights ?? PESOS_CATEGORIA;
  const reglas = { now, tz: mk.tz, electoral: mk.electoral_mode, consensoMax: Number(motor.discard_consensus_over ?? 80) };

  // Presupuesto de Anthropic: con el tope del mes gastado, no se llama al
  // modelo (las señales quedan 'new' y se purgan a los 30 días).
  const modelo = motor.models?.generator ?? MODELO_DEFECTO;
  const tope = Number(motor.budgets_usd_month?.anthropic ?? 80);
  const sinPresupuesto = anthropicKey ? (await gastoMes(admin)) >= tope : false;
  if (sinPresupuesto) ing.errores.push(`presupuesto de Anthropic agotado (${tope} USD/mes)`);
  const client = anthropicKey && !sinPresupuesto ? new Anthropic({ apiKey: anthropicKey }) : null;
  const system = sistema(mk);
  const uso: Uso = { entrada: 0, salida: 0 };

  // Generación EN PARALELO por tandas: en serie sólo daba tiempo a unas pocas
  // antes del timeout, y por eso salían "de 3 en 3".
  // deno-lint-ignore no-explicit-any
  const lista: any[] = sinPresupuesto ? [] : (signals ?? []);
  const TANDA = 8;
  // deno-lint-ignore no-explicit-any
  const generadas: Array<{ s: any; m: Material; cand: Candidata | null; motivo?: string }> = [];
  for (let i = 0; i < lista.length; i += TANDA) {
    const tanda = lista.slice(i, i + TANDA);
    const res = await Promise.all(tanda.map(async (sig) => {
      const raw = (sig.raw ?? {}) as Record<string, unknown>;
      const m: Material = {
        titular: String(raw.titular ?? sig.topic ?? ""),
        contexto: String(raw.contexto ?? ""),
        entidad: (raw.entidad as string) ?? null,
        categoria: sig.category ?? null,
        publicado: (raw.publicado as string) ?? null,
        hoy,
        zona: mk.tz,
      };
      if (!client) return { s: sig, m, cand: null, motivo: "sin_modelo" };
      try { return { s: sig, m, ...(await generar(client, modelo, system, m, uso)) }; }
      catch (err) {
        if (ing.errores.length < 20) ing.errores.push(`modelo: ${String(err).slice(0, 160)}`);
        return { s: sig, m, cand: null, motivo: "error_modelo" };
      }
    }));
    generadas.push(...res);
  }

  for (const { s, m, cand, motivo: motivoModelo } of generadas) {
    // Sin modelo no se inventan porras de plantilla: sólo generaban ruido.
    const motivo = cand ? rejectReason(cand, `${m.titular} ${m.contexto}`, reglas) : (motivoModelo ?? "sin_modelo");
    if (motivo || !cand) {
      descartadas++;
      cuenta(motivos, motivo ?? "sin_modelo");
      // si esto fallara, la señal volvería a procesarse en cada barrido
      await admin.from("signals").update({ status: "rejected" }).eq("id", s.id);
      continue;
    }
    // validado en rejectReason: pregunta, opciones, fechas y reparto existen
    const titulo = String(cand.pregunta).trim().slice(0, 120);
    const opciones = (cand.opciones ?? []).map((o) => String(o).trim());
    const cierre = cierreDesde(cand.fecha_evento, mk.tz)!;
    const resultado = resolucionDesde(cand.fecha_resultado, mk.tz)!;
    // DUPLICADOS por evento: contra la cola, las porras abiertas y esta tanda.
    const h = huella(titulo, opciones, m.entidad, cierre.closesAt, mk.tz);
    if (esRepetida(h, previas)) {
      repetidas++;
      cuenta(motivos, "repetida");
      await admin.from("signals").update({ status: "scored" }).eq("id", s.id);
      continue;
    }
    // Ritmo: como mucho N candidatas por entidad y día (B.5).
    const ent = (s.entity_id as string | null) ?? null;
    if (ent && (porEntidad[ent] ?? 0) >= maxEntidad) {
      descartadas++;
      cuenta(motivos, "cupo_entidad");
      await admin.from("signals").update({ status: "rejected" }).eq("id", s.id);
      continue;
    }
    // NOTA 0–100 (B.6). Sin radar todavía (F3), el calor no cuenta y su peso se reparte.
    const categoria = (CATEGORIAS as readonly string[]).includes(cand.categoria ?? "") ? cand.categoria! : "otros";
    const n = nota({
      now, resolvesAt: resultado.ts, reparto: Number(cand.reparto_esperado), heat: null,
      tipoFuente: cand.tipo_fuente, categoriaCorta: categoriaCorta(categoria, porCategoria, pesosCategoria),
    }, motor.score_weights);
    if (n.score < umbral) {
      descartadas++;
      cuenta(motivos, "nota_baja");
      await admin.from("signals").update({ status: "rejected" }).eq("id", s.id);
      continue;
    }
    previas.push(h);
    const politica = cand.es_politica === true || esPolitica(`${titulo} ${opciones.join(" ")}`);
    const fila: Record<string, unknown> = {
      title: titulo,
      options: opciones,
      source_url: s.raw?.source_url ?? null,
      source_title: m.titular || null,
      category: categoria,
      resolution_criteria: cand.criterio_de_resolucion,
      closes_at: cierre.closesAt,
      resolves_at: resultado.resolvesAt,
      resolution_kind: "news",
      resolution_source: String(cand.fuente_resolucion ?? "").slice(0, 400),
      expected_split: Number(cand.reparto_esperado),
      confidence: Math.max(0, Math.min(1, Number(cand.confianza ?? 0))),
      score: n.score,
      score_breakdown: n.breakdown,
      autonomy: "B",
      market,
      flags: [...flagsSuaves(cierre), ...(politica ? ["politica"] : [])],
      lang: "es",
      kind: "porra",
      signal_id: s.id,
      status: "pending_review",
    };
    const { error } = await admin.from("topic_proposals").insert(fila);
    if (!error) {
      created++;
      if (ent) cuenta(porEntidad, ent);
      cuenta(porCategoria, categoria);
      await admin.from("signals").update({ status: "scored" }).eq("id", s.id);
    } else {
      descartadas++;
      cuenta(motivos, "insert");
      if (ing.errores.length < 20) ing.errores.push(`insert: ${String(error.message).slice(0, 160)}`);
      await admin.from("signals").update({ status: "rejected" }).eq("id", s.id);
    }
  }

  const precio = motor.prices_usd_per_mtok?.[modelo] ?? [0.10, 0.50];
  const coste = (uso.entrada * precio[0] + uso.salida * precio[1]) / 1e6;
  const counts = { ingested, created, repetidas, descartadas, motivos, ingesta_descartes: ing.descartes, tokens: uso };
  if (run?.id) {
    await admin.from("agent_runs").update({
      counts, errors: ing.errores.slice(0, 20), cost_usd: coste,
      duration_ms: Date.now() - t0, finished_at: new Date().toISOString(),
    }).eq("id", run.id);
  }
  return json({
    version: 4, market, ...counts, coste_usd: Number(coste.toFixed(4)), errores: ing.errores.length,
    force, used: client ? modelo : "ninguno",
  });
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
