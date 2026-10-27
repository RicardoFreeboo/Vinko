// Edge Function: POST /ads-stripe-webhook  (webhook de Stripe; verify_jwt=false)
// Verifica la FIRMA de Stripe (STRIPE_WEBHOOK_SECRET) sobre el cuerpo crudo y, en
// checkout.session.completed, marca la campaña pagada y la ACTIVA. Idempotente:
// solo pasa de borrador/revisión a activa, así que un reenvío del webhook no hace
// nada. B2B: pagó el anunciante; el JUGADOR nunca toca dinero.
//
// La porra real en el feed (A0) se materializará a partir del borrador cuando se
// cablee la entrega; aquí solo se marca la campaña como activa y pagada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Comparación en tiempo (casi) constante sobre hex de igual longitud.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Firma de Stripe: cabecera "t=<ts>,v1=<hex>[,v1=<hex>]". HMAC-SHA256 de
// `${t}.${payload}` con el secreto; vale si coincide con alguna v1.
async function verify(sigHeader: string, payload: string, secret: string): Promise<boolean> {
  const items = sigHeader.split(",").map((p) => p.split("="));
  const t = items.find((i) => i[0] === "t")?.[1];
  const sigs = items.filter((i) => i[0] === "v1").map((i) => i[1]);
  if (!t || !sigs.length) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => safeEqual(s, hex));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!secret) return new Response("no_secret", { status: 400 });

  const payload = await req.text(); // CRUDO: necesario para la firma
  const sig = req.headers.get("stripe-signature") ?? "";
  if (!(await verify(sig, payload, secret))) return new Response("bad_signature", { status: 400 });

  let event: { type?: string; data?: { object?: { metadata?: { campaign_id?: string }; client_reference_id?: string } } } = {};
  try { event = JSON.parse(payload); } catch { return new Response("bad_json", { status: 400 }); }

  if (event.type === "checkout.session.completed") {
    const s = event.data?.object ?? {};
    const campaignId = s.metadata?.campaign_id ?? s.client_reference_id ?? "";
    if (/^[0-9a-f-]{36}$/i.test(campaignId)) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const now = new Date().toISOString();
      // Idempotente: solo activa lo que aún no está activo.
      await admin.from("ad_campaigns")
        .update({ status: "active", paid_at: now, starts_at: now })
        .eq("id", campaignId)
        .in("status", ["draft", "in_review"]);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "content-type": "application/json" },
  });
});
