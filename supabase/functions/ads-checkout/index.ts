// Edge Function: POST /ads-checkout { campaign_id, origin } -> { url } | { error }
// VINKO ADS · pago B2B. Crea una sesión de Stripe Checkout (página alojada por
// Stripe) por el presupuesto de la campaña. El ANUNCIANTE paga; el webhook
// ads-stripe-webhook activa la campaña al confirmarse. El JUGADOR nunca toca
// dinero. La clave vive solo como secreto del proyecto (STRIPE_SECRET_KEY).
// Gated: sin clave -> {error:"no_stripe"} y /ads/nueva deja la campaña en borrador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeKey) return json({ error: "no_stripe" }, 400); // el cliente deja la campaña en borrador

  // Solo el anunciante autenticado, y solo sobre SU campaña (RLS por dueño).
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const campaignId = String(body.campaign_id ?? "");
  const origin = String(body.origin ?? "").replace(/\/+$/, "");
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return json({ error: "bad_campaign" }, 400);
  if (!/^https:\/\/[^\s/]+$/i.test(origin)) return json({ error: "bad_origin" }, 400);

  // La campaña debe ser suya (RLS) y estar aún sin pagar.
  const { data: c } = await sb.from("ad_campaigns")
    .select("id, budget_cents, draft_question, status")
    .eq("id", campaignId).maybeSingle();
  if (!c) return json({ error: "not_found" }, 404);
  if (c.status !== "draft" && c.status !== "in_review") return json({ error: "bad_status" }, 409);
  if (!c.budget_cents || c.budget_cents < 50) return json({ error: "bad_amount" }, 400);

  const name = (c.draft_question ? String(c.draft_question).slice(0, 120) : "") || "Campaña Vinko Ads";
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${origin}/ads/panel?ok=1`);
  form.set("cancel_url", `${origin}/ads/nueva`);
  form.set("client_reference_id", campaignId);
  form.set("metadata[campaign_id]", campaignId);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(c.budget_cents));
  form.set("line_items[0][price_data][product_data][name]", `Vinko Ads · ${name}`);

  let session: { id?: string; url?: string } = {};
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    session = await res.json();
    if (!res.ok || !session.url) throw new Error("stripe");
  } catch { return json({ error: "stripe" }, 502); }

  // Guarda el id de sesión en SU campaña (RLS): llave de idempotencia del webhook.
  await sb.from("ad_campaigns").update({ stripe_session_id: session.id }).eq("id", campaignId);

  return json({ url: session.url });
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
