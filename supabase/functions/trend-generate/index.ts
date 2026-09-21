// Edge Function: POST /trend-generate — agente de tendencias de Vinko. v3 (21-sep-2026)
// Convierte señales REALES de actualidad en porras candidatas para la cola de
// revisión humana (topic_proposals). NUNCA publica: eso es publish_proposal
// desde /admin/temas (el cron de autopublicación se apagó en 0030).
//
// FUENTES (todas gratuitas y sin clave):
//  1. tracked_entities (catálogo, editable en /admin/catalogo) -> Google News
//     RSS por palabra clave, con Bing News de respaldo. Es la fuente PRIMARIA.
//  2. Búsqueda dirigida por tema desde /admin/temas.
// La red general de titulares y Google Trends se eliminaron: metían política,
// deportes irrelevantes y términos sueltos ("justicia") sin desenlace.
//
// GUARDARRAÍLES (todos en ./filtros.ts, puros y testados en Node), aplicados
// YA EN LA INGESTA y otra vez sobre lo que devuelve el modelo:
//  léxico prohibido · veto de cuotas · contenido inseguro · política partidista
//  · MENORES (sub-XX, juvenil, cadete, "N años"<18, colegio/instituto)
//  · YA OCURRIÓ (el titular cuenta el resultado) · FECHA REAL extraída del
//  texto (nunca estimada) · la noticia debe nombrar a la entidad vigilada
//  · DUPLICADOS por evento (Jaccard sobre tokens) contra la cola de 14 días,
//  las porras abiertas y la propia tanda.
// v3 corrige lo que produjo el v2: un menor como protagonista, preguntas sobre
// finales ya jugadas, 3-4 copias del mismo evento y fechas inventadas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type Candidata, type Huella,
  cierreDesde, coincideEntidad, esRepetida, flagsSuaves, huella, looksLikeEvent,
  norm, rejectReason, tieneFechaEnTexto, vetoed, yaOcurrido,
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

const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es&gl=ES&ceid=ES:es`;
// Respaldo: Bing News RSS (mismo formato <item><title><description>).
const bnews = (q: string) =>
  `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=es-ES&cc=ES&qft=sortbydate%3d%221%22`;

// Google bloquea IPs de servidor tras muchas peticiones (503 "Sorry…") y el
// agente se quedaba a 0 sin avisar. Se prueba Google y, si no da noticias,
// Bing. Devuelve los items y qué fuente respondió.
async function fetchNews(q: string): Promise<{ items: Item[]; via: string }> {
  for (const [via, url] of [["google", gnews(q)], ["bing", bnews(q)]] as const) {
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
// Motivos de descarte EN LA INGESTA (se devuelven en la respuesta para que el
// admin vea por qué un barrido dio pocas porras).
type Ingesta = { seen: Set<string>; descartes: Record<string, number> };
function cuenta(m: Record<string, number>, k: string) { m[k] = (m[k] ?? 0) + 1; }

// deno-lint-ignore no-explicit-any
async function insertSignal(admin: any, ing: Ingesta, it: Item, meta: Record<string, unknown>, entidad?: Entidad): Promise<boolean> {
  const k = norm(it.t);
  if (ing.seen.has(k)) { cuenta(ing.descartes, "vista"); return false; }
  if (!looksLikeEvent(it.t)) { cuenta(ing.descartes, "no_evento"); return false; }
  // Se veta sobre titular + contexto: la política venía en la descripción
  // ("PP y Vox…") mientras el titular parecía neutro. Menores incluidos.
  const v = vetoed(`${it.t} ${it.d}`);
  if (v) { cuenta(ing.descartes, v); return false; }
  // Titular que ya cuenta el desenlace: no gastamos modelo en él.
  if (yaOcurrido(it.t, it.d)) { cuenta(ing.descartes, "ya_ocurrido"); return false; }
  // La noticia tiene que hablar de la entidad que buscábamos (Google devuelve
  // "relacionados" que no lo son).
  if (entidad && !coincideEntidad(it.t, entidad.nombre, entidad.claves)) { cuenta(ing.descartes, "sin_entidad"); return false; }
  const raw = { ...(meta.raw as Record<string, unknown> ?? {}), titular: it.t, contexto: it.d, source_url: it.link, publicado: it.pub };
  const { error } = await admin.from("signals").insert({
    topic: it.t, status: "new", velocity: 60, ...meta, raw,
  });
  if (error) { cuenta(ing.descartes, "insert"); return false; }
  ing.seen.add(k);
  return true;
}

// FUENTE PRIMARIA: el catálogo (tracked_entities) vía Google News / Bing.
// deno-lint-ignore no-explicit-any
async function sweepEntities(admin: any, ing: Ingesta, max: number): Promise<number> {
  const { data: ents } = await admin.from("tracked_entities")
    .select("id, nombre, categoria, palabras_clave, last_swept_at")
    .eq("activo", true)
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
      for (const it of (await fetchNews(q)).items.slice(0, 4)) {
        if (n >= max) break;
        if (await insertSignal(admin, ing, it, {
          category: e.categoria, source: "gnews", score: 70,
          raw: { entidad: e.nombre, consulta: q },
        }, { nombre: e.nombre, claves })) n++;
      }
    } catch { /* fuente caída: seguimos */ }
    await admin.from("tracked_entities").update({ last_swept_at: new Date().toISOString() }).eq("id", e.id);
  }
  return n;
}

const SYSTEM = `Eres el generador de porras de Vinko: conviertes UNA noticia real en una porra social de puntos virtuales para público español (realities, streamers, fútbol, música, cultura pop).

Recibes un JSON con: titular, contexto (extracto de la noticia), entidad (lo que vigilamos), publicado (fecha de la noticia) y hoy (fecha actual).

REGLAS ABSOLUTAS (si incumples alguna, devuelve invalida=true):
- Léxico prohibido: apuesta, apostar, bet, cuota, odds, casa de apuestas, bote, jackpot, casino, ganar dinero. Usa: porra, pronóstico, predicción, puntos.
- FUTURO, no pasado: la porra pregunta por un desenlace que TODAVÍA NO ha ocurrido. Si el titular o el contexto ya cuentan el resultado (quién ganó, quién fue expulsado, cómo terminó, quién es campeón), pon ya_ocurrido=true e invalida=true. Jamás preguntes "quién fue", "quién ganó" ni "quién ha sido".
- FECHA REAL, nunca estimada: fecha_evento es la fecha del desenlace TAL COMO APARECE en el material (día del partido, gala, combate, estreno, carrera). Convierte expresiones relativas ("este domingo", "mañana", "el jueves") usando la fecha de publicado. Si el material NO dice cuándo ocurre, fecha_evento=null e invalida=true. Prohibido suponer "la próxima jornada" o "la semana que viene".
  Formato: "YYYY-MM-DDTHH:MM" en hora de España si el texto da la hora; "YYYY-MM-DD" si solo da el día.
- MENORES: si el protagonista tiene menos de 18 años (sub-16, sub-17, juvenil, cadete, infantil, "a sus 16 años", instituto, colegio) → invalida=true. Nunca un menor como sujeto de una porra.
- RESOLUBLE: debe existir un desenlace objetivo y público. criterio_de_resolucion dice con qué fuente se declara el ganador (web oficial, acta, clasificación, comunicado, audiencias). Si no se puede verificar, invalida=true.
- Opciones CONCRETAS: nombres propios REALES que aparezcan en el titular o en contexto. Prohibido inventar y prohibido cualquier relleno tipo "Equipo 1", "Participante A", "Opción B". Si no hay nombres reales suficientes para 2 opciones, invalida=true. Es preferible una porra binaria con dos desenlaces concretos ("Sí, antes del domingo" / "No") que una lista de relleno.
- NADA de política partidista, partidos, elecciones, gobiernos ni geopolítica: invalida=true.
- SIN DIFAMACIÓN: la porra pregunta por un hecho público que ocurrirá y se declarará objetivamente. Jamás por acusaciones, delitos, rumores o la vida privada de nadie: invalida=true.
- Si la noticia es sobre muerte, violencia, delitos o desgracias: invalida=true.
- Preferimos preguntas de pique: quién gana, quién cae, pasa sí o no.

Devuelve SOLO JSON: {"pregunta":"…","opciones":["…"],"fecha_evento":"YYYY-MM-DD | YYYY-MM-DDTHH:MM | null","ya_ocurrido":false,"criterio_de_resolucion":"…","categoria":"…","invalida":false}`;

type Material = { titular: string; contexto: string; entidad: string | null; categoria: string | null; publicado: string | null; hoy: string };

async function withHaiku(key: string, m: Material): Promise<Candidata> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(m) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const j = await res.json();
  const text = j?.content?.[0]?.text ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : "{}");
}

// Huellas de lo que ya existe: cola de 14 días (pendientes + publicadas) y
// porras abiertas. Contra esto se deduplica cada candidata nueva.
// deno-lint-ignore no-explicit-any
async function huellasPrevias(admin: any): Promise<Huella[]> {
  const out: Huella[] = [];
  const desde = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: previas } = await admin.from("topic_proposals")
    .select("title, options, closes_at, signals(raw)")
    .in("status", ["pending_review", "published"])
    .gt("created_at", desde).limit(1000);
  for (const p of previas ?? []) {
    const raw = (Array.isArray(p.signals) ? p.signals[0]?.raw : p.signals?.raw) as Record<string, unknown> | undefined;
    out.push(huella(String(p.title ?? ""), (p.options ?? []) as string[], (raw?.entidad as string) ?? null, p.closes_at));
  }
  const { data: abiertas } = await admin.from("porras")
    .select("title, closes_at, porra_options(label)")
    .eq("status", "open").eq("is_template", false)
    .gt("closes_at", new Date().toISOString()).limit(800);
  for (const p of abiertas ?? []) {
    const ops = ((p.porra_options ?? []) as { label: string }[]).map((o) => o.label);
    out.push(huella(String(p.title ?? ""), ops, null, p.closes_at));
  }
  return out;
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
  const limit = Math.min(Number(body.limit) || 18, 30);
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 120) : "";
  // RENOVAR: ignora el deduplicador de titulares ya vistos. La búsqueda dirigida
  // también lo ignora: si pides un tema a propósito, se regenera aunque ya se
  // hubiera leído esa noticia (antes devolvía 0 y la pantalla se quedaba vacía).
  const force = body.force === true;

  // DIAGNÓSTICO (solo con secreto de cron): qué recibe el SERVIDOR de Google
  // News / Bing y qué diría cada filtro de la muestra.
  if (body.debug === true && Deno.env.get("CRON_SECRET") && req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET")) {
    const qd = typeof body.topic === "string" && body.topic ? body.topic : "Kings League";
    try {
      const out: Record<string, unknown> = {};
      for (const [via, url] of [["google", gnews(qd)], ["bing", bnews(qd)]] as const) {
        const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (VinkoAgent)" } });
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
      return json({ debug: true, version: 3, consulta: qd, ...out });
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

  const ing: Ingesta = { seen: force || topic ? new Set<string>() : await seenTopics(admin), descartes: {} };
  let ingested = 0;

  if (topic) {
    // BÚSQUEDA DIRIGIDA: se buscan NOTICIAS REALES del tema y de ahí salen las
    // señales. El tema hace de entidad: el titular tiene que nombrarlo.
    const v = vetoed(topic);
    if (v) return json({ created: 0, error: "tema_vetado", motivo: v });
    try {
      for (const it of (await fetchNews(topic)).items.slice(0, 6)) {
        if (await insertSignal(admin, ing, it, {
          category: "busqueda", source: "search", score: 80,
          raw: { consulta: topic },
        }, { nombre: topic, claves: [] })) ingested++;
      }
    } catch { /* red caída */ }
    if (!ingested) {
      return json({ created: 0, sin_noticias: true, ingesta_descartes: ing.descartes, mensaje: `Sin noticias recientes utilizables sobre "${topic}".` });
    }
  } else {
    // SOLO el catálogo: la red general de titulares metía política (Ceuta, el
    // Rey), deportes irrelevantes (cricket) y listículos sin desenlace.
    ingested += await sweepEntities(admin, ing, limit);
  }
  await admin.from("agent_runs").insert({ kind: topic ? "search" : "sweep", topic: topic || null });

  const q = admin.from("signals").select("*").eq("status", "new");
  const { data: signals } = topic
    ? await q.eq("source", "search").order("created_at", { ascending: false }).limit(8)
    : await q.order("created_at", { ascending: false }).limit(limit);

  let created = 0, descartadas = 0, repetidas = 0;
  const motivos: Record<string, number> = {};
  const previas = await huellasPrevias(admin);
  const hoy = new Date().toISOString().slice(0, 10);

  // Generación EN PARALELO por tandas: en serie sólo daba tiempo a unas pocas
  // antes del timeout, y por eso salían "de 3 en 3".
  // deno-lint-ignore no-explicit-any
  const lista: any[] = signals ?? [];
  const TANDA = 8;
  // deno-lint-ignore no-explicit-any
  const generadas: Array<{ s: any; m: Material; cand: Candidata | null }> = [];
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
      };
      try { return { s: sig, m, cand: anthropic ? await withHaiku(anthropic, m) : null }; }
      catch { return { s: sig, m, cand: null }; }
    }));
    generadas.push(...res);
  }

  for (const { s, m, cand } of generadas) {
    // Sin modelo no se inventan porras de plantilla: sólo generaban ruido.
    const motivo = cand ? rejectReason(cand, `${m.titular} ${m.contexto}`) : "sin_modelo";
    if (motivo || !cand) {
      descartadas++;
      cuenta(motivos, motivo ?? "sin_modelo");
      // si esto fallara, la señal volvería a procesarse en cada barrido
      await admin.from("signals").update({ status: "rejected" }).eq("id", s.id);
      continue;
    }
    const titulo = String(cand.pregunta).slice(0, 160);
    const opciones = (cand.opciones ?? []).map((o) => String(o).trim().slice(0, 80));
    const cierre = cierreDesde(cand.fecha_evento)!; // validado en rejectReason
    // DUPLICADOS por evento: contra la cola, las porras abiertas y esta tanda.
    const h = huella(titulo, opciones, m.entidad, cierre.closesAt);
    if (esRepetida(h, previas)) {
      repetidas++;
      cuenta(motivos, "repetida");
      await admin.from("signals").update({ status: "scored" }).eq("id", s.id);
      continue;
    }
    previas.push(h);
    const fila: Record<string, unknown> = {
      title: titulo,
      options: opciones,
      source_url: s.raw?.source_url ?? null,
      source_title: m.titular || null,
      category: cand.categoria ?? s.category,
      resolution_criteria: cand.criterio_de_resolucion,
      closes_at: cierre.closesAt,
      score: s.score,
      flags: flagsSuaves(cierre),
      lang: s.lang ?? "es",
      kind: "porra",
      signal_id: s.id,
      status: "pending_review",
    };
    let { error } = await admin.from("topic_proposals").insert(fila);
    // Migración 0032 aún sin aplicar (source_title): no perdemos la porra.
    if (error && /source_title/.test(String(error.message))) {
      delete fila.source_title;
      ({ error } = await admin.from("topic_proposals").insert(fila));
    }
    if (!error) {
      created++;
      await admin.from("signals").update({ status: "scored" }).eq("id", s.id);
    } else {
      descartadas++;
      cuenta(motivos, "insert");
      await admin.from("signals").update({ status: "rejected" }).eq("id", s.id);
    }
  }
  return json({
    version: 3, created, repetidas, descartadas, motivos, ingested,
    ingesta_descartes: ing.descartes, force, used: anthropic ? "haiku" : "ninguno",
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
