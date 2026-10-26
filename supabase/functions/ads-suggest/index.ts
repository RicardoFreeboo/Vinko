// Edge Function: POST /ads-suggest { brief, objective?, market? } -> { ideas:[{pregunta,opciones[]}] }
// A3 de VINKO ADS (VINKO_PANTALLAS §6): a partir del BRIEF de la marca, Haiku
// propone 3 preguntas de porra PATROCINADA. Mismo patrón que voice-porra: filtro
// de léxico solo-puntos y de seguridad sobre lo que devuelve el modelo.
//
// La clave ANTHROPIC_API_KEY vive SOLO como secreto del proyecto (Deno.env), igual
// que en trend-generate/voice-porra; nunca en el repo ni en el cliente. Sin clave
// -> {error:"no_key"} y /ads/nueva cae a redacción manual (la sugerencia es opcional).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Léxico prohibido (REGLAS-LEGALES / lexicon-check) + contenido inseguro. Si una
// idea lo toca, se descarta en silencio y se devuelven solo las limpias.
const BANNED = [
  /apuest\w*/i, /apost\w*/i, /\bbet\b/i, /betting/i, /\bwager\w*/i,
  /\bcuota\w*/i, /\bodds?\b/i, /casa de apuestas/i, /\bjackpot\b/i,
  /\bbote\b/i, /\bcasino\b/i, /\bwallet\b/i, /\bcash\b/i,
  /ganar dinero/i, /dinero real/i,
];
const UNSAFE = /(asesin|matar\b|homicid|pederast|pedofil|porno|coca.na|hero.na|narcotr|arma de fuego|explosiv|nazi|violent)/i;

const SYSTEM = `Eres el estratega de VINKO ADS. Una MARCA quiere patrocinar una predicción:
una pregunta social de pronóstico que la gente juega con PUNTOS virtuales, sin dinero.

A partir del brief de la marca, propón 3 preguntas de predicción que:
- conecten de forma natural con la marca y den pie a pique u opinión;
- tengan 2 a 4 opciones concretas y claras;
- sean de FUTURO y resolubles (un desenlace objetivo), o de opinión clara;
- usen español neutro, o de Colombia si market=CO.

PROHIBIDO (si una idea lo incumple, NO la incluyas):
- Léxico de juego con dinero: apuesta, apostar, bet, cuota, odds, bote, jackpot,
  casino, dinero real, ganar dinero. Usa: porra, pronóstico, predicción, puntos.
- Prometer premios con valor, dinero, regalos caros o descuentos como recompensa
  del juego: el premio de una predicción son SOLO puntos.
- Menores, política partidista, difamación, violencia, delitos, salud o medicina.

Devuelve SOLO JSON: {"ideas":[{"pregunta":"…","opciones":["…","…"]}]}. Máximo 3.`;

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Solo un anunciante autenticado (el flujo /ads/nueva exige login): no se gasta
  // modelo para peticiones anónimas.
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "forbidden" }, 403);

  const key = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key) return json({ error: "no_key" }, 400); // el cliente cae a redacción manual

  const body = await req.json().catch(() => ({}));
  const brief = String(body.brief ?? "").trim().slice(0, 600);
  const objective = ["awareness", "opinion", "traffic"].includes(body.objective) ? body.objective : "opinion";
  const market = body.market === "CO" ? "CO" : "GLOBAL";
  if (brief.length < 8) return json({ error: "empty" }, 400);

  let cand: { ideas?: { pregunta?: string; opciones?: string[] }[] } = {};
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: "user", content: JSON.stringify({ brief, objetivo: objective, market }) }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const j = await res.json();
    const text = j?.content?.[0]?.text ?? "{}";
    const m = text.match(/\{[\s\S]*\}/);
    cand = JSON.parse(m ? m[0] : "{}");
  } catch { return json({ error: "haiku" }, 502); }

  // Filtro solo-puntos sobre cada idea; se devuelven únicamente las que pasan.
  const ideas = (cand.ideas ?? [])
    .map((i) => ({
      pregunta: String(i?.pregunta ?? "").trim().slice(0, 120),
      opciones: (Array.isArray(i?.opciones) ? i.opciones : [])
        .map((o) => String(o).trim().slice(0, 40)).filter(Boolean).slice(0, 4),
    }))
    .filter((i) => {
      const blob = [i.pregunta, ...i.opciones].join(" ");
      return i.pregunta.length >= 5 && i.opciones.length >= 2
        && !BANNED.some((r) => r.test(blob)) && !UNSAFE.test(blob);
    })
    .slice(0, 3);

  if (!ideas.length) return json({ error: "invalid" }, 422);
  return json({ ideas });
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
