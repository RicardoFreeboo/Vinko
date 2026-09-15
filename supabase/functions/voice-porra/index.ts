// Edge Function: POST /voice-porra { transcript } -> { pregunta, opciones[] }
// Convierte lo que el usuario DICTA en una porra estructurada (Haiku). Filtro de
// léxico y de seguridad. La llama /api/voice-porra (servidor) con el cron secret.
const BANNED = [/apuest\w*/i, /apost\w*/i, /\bbet\b/i, /\bcuota\w*/i, /\bodds?\b/i, /casino/i];
const UNSAFE = /(asesin|matar\b|homicid|pederast|pedofil|porno|coca.na|hero.na|narcotr|arma de fuego|explosiv|nazi|violent)/i;

const SYSTEM = `Eres el asistente de Vinko. El usuario DICTA una porra en voz. Extrae:
- "pregunta": una pregunta clara de pronóstico (5-120 caracteres).
- "opciones": 2 a 6 opciones de respuesta.
Si el usuario no dio opciones claras y es sí/no, usa ["Sí","No"].
Nunca uses las palabras apuesta/apostar/cuota. Usa pronóstico/porra.
Devuelve SOLO JSON: {"pregunta","opciones":["..."],"invalida":false}. Si no se entiende, invalida:true.`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);
  const key = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key) return json({ error: "no_key" }, 400);

  let transcript = "";
  try { transcript = String((await req.json()).transcript ?? "").slice(0, 800); } catch { /* noop */ }
  if (transcript.trim().length < 4) return json({ error: "empty" }, 400);

  let cand: { pregunta?: string; opciones?: string[]; invalida?: boolean } = {};
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 400, system: SYSTEM, messages: [{ role: "user", content: transcript }] }),
    });
    const j = await res.json();
    const text = j?.content?.[0]?.text ?? "{}";
    const m = text.match(/\{[\s\S]*\}/);
    cand = JSON.parse(m ? m[0] : "{}");
  } catch { return json({ error: "haiku" }, 502); }

  const blob = [cand.pregunta ?? "", ...(cand.opciones ?? [])].join(" ");
  if (cand.invalida || BANNED.some((r) => r.test(blob)) || UNSAFE.test(blob) || !cand.pregunta) {
    return json({ error: "invalid" }, 422);
  }
  return json({
    pregunta: String(cand.pregunta).slice(0, 120),
    opciones: (cand.opciones ?? ["Sí", "No"]).slice(0, 6).map((o) => String(o).slice(0, 40)),
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
