// Edge Function: POST /trend-generate — paso 4 del agente de tendencias.
// Toma señales (signals) y las convierte en porras CANDIDATAS que van a la
// cola de aprobación humana (topic_proposals.status='pending_review'). NUNCA
// publica: eso lo hace un humano con publish_proposal.
// - Con ANTHROPIC_API_KEY → genera con Claude Haiku (contrato del §6).
// - Sin clave → fallback por plantilla (marcado flags:["sin_haiku"]).
// Filtros incrustados: léxico prohibido (L5) + veto de cuotas (§0) + criterio
// de resolución obligatorio. Lo que falla un filtro entra en rojo, no se tira.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BANNED = [
  /apuest\w*/i, /apost\w*/i, /\bbet\b/i, /betting/i, /\bwager\w*/i, /\bcuota\w*/i,
  /\bodds?\b/i, /casa de apuestas/i, /\bjackpot\b/i, /\bbote\b/i, /\bcasino\b/i,
  /\bwallet\b/i, /\bcash\b/i, /ganar dinero/i, /dinero real/i,
];
const ODDS = /(\bodds\b|\bcuota|\bspread\b|\bpayout\b|\bhandicap\b|\bmoneyline\b|over\/under|\bbookmaker|\btipster|\b[1-9]\.[0-9]{2}\b)/i;

function flagsFor(c: { pregunta: string; opciones: string[]; criterio_de_resolucion?: string; fecha_cierre?: string }): string[] {
  const flags: string[] = [];
  const crit = c.criterio_de_resolucion ?? "";
  const blob = [c.pregunta, ...(c.opciones ?? []), crit].join(" ");
  if (BANNED.some((r) => r.test(blob))) flags.push("lexico");
  if (ODDS.test(blob)) flags.push("cuotas");
  if (!crit || crit.length < 5) flags.push("sin_resolucion");
  if (!c.pregunta || c.pregunta.length < 5 || c.pregunta.length > 120) flags.push("pregunta");
  if (!c.opciones || c.opciones.length < 2 || c.opciones.length > 6) flags.push("opciones");
  return flags;
}

const SYSTEM = `Eres el generador de porras de Vinko. Conviertes una señal de actualidad en una porra social de puntos virtuales.
REGLAS ABSOLUTAS:
- Léxico prohibido: nunca uses apuesta, apostar, bet, cuota, odds, casa de apuestas, bote, jackpot, ganar dinero. Usa: porra, pronóstico, predicción, puntos.
- Debes escribir un criterio_de_resolucion: cómo se declara objetivamente el ganador el día del cierre. Si no puedes, marca invalida=true.
- fecha_cierre siempre ANTES del desenlace.
- Neutral y no partidista en actualidad. Nunca menores como sujeto.
Devuelve SOLO JSON: {"pregunta","opciones":["..."],"fecha_cierre":"ISO","criterio_de_resolucion","categoria","invalida":false}`;

async function withHaiku(key: string, signal: Record<string, unknown>) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(signal) }],
    }),
  });
  const j = await res.json();
  const text = j?.content?.[0]?.text ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : "{}");
}

function templated(signal: Record<string, unknown>) {
  const topic = String(signal.topic ?? "");
  return {
    pregunta: topic.endsWith("?") ? topic : `¿${topic}?`,
    opciones: ["Sí", "No"],
    fecha_cierre: signal.resolution_date ?? new Date(Date.now() + 2 * 86400000).toISOString(),
    criterio_de_resolucion: `Se declara con la fuente pública: ${signal.source ?? "editorial"}.`,
    categoria: signal.category ?? "actualidad",
    invalida: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropic = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const admin = createClient(url, service);

  const body = await req.json().catch(() => ({}));
  const limit = body.limit ?? 5;
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 120) : "";

  // Auth: cron secret (pg_cron) O JWT de admin (botón del panel, C/D).
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const isCron = secret && req.headers.get("x-cron-secret") === secret;
  let isAdmin = false;
  if (!isCron) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      isAdmin = prof?.role === "admin";
    }
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    // cooldown solo para disparos manuales (§C/D): imposible desde dos clics
    const { data: recent } = await admin.from("agent_runs")
      .select("id").gt("created_at", new Date(Date.now() - 60000).toISOString()).limit(1);
    if (recent && recent.length) return json({ cooldown: true });
  }

  // búsqueda dirigida (§D): el topic entra como señal antes de generar
  if (topic) {
    await admin.from("signals").insert({
      topic, category: "busqueda", source: "search", status: "new", velocity: 70,
    });
  }
  await admin.from("agent_runs").insert({ kind: topic ? "search" : "sweep", topic: topic || null });

  const q = admin.from("signals").select("*").in("status", ["new", "scored"]);
  const { data: signals } = topic
    ? await q.eq("source", "search").order("created_at", { ascending: false }).limit(3)
    : await q.order("score", { ascending: false, nullsFirst: false }).limit(limit);

  let created = 0, flagged = 0;
  for (const s of signals ?? []) {
    let cand;
    try {
      cand = anthropic ? await withHaiku(anthropic, s) : templated(s);
    } catch { cand = templated(s); }
    const flags = flagsFor(cand);
    if (!anthropic) flags.push("sin_haiku");
    if (cand.invalida) flags.push("invalida");

    const { error } = await admin.from("topic_proposals").insert({
      title: String(cand.pregunta ?? s.topic).slice(0, 160),
      options: cand.opciones ?? ["Sí", "No"],
      source_url: s.raw?.source_url ?? null,
      category: cand.categoria ?? s.category,
      resolution_criteria: cand.criterio_de_resolucion ?? null,
      closes_at: cand.fecha_cierre ?? s.resolution_date,
      score: s.score,
      flags,
      lang: s.lang ?? "es",
      kind: "porra",
      signal_id: s.id,
      status: "pending_review",
    });
    if (!error) {
      created++;
      if (flags.length) flagged++;
      await admin.from("signals").update({ status: "scored" }).eq("id", s.id);
    }
  }
  return json({ created, flagged, used: anthropic ? "haiku" : "template" });
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
