// Edge Function: POST /billing-webhook  (Vinko Club, VINKO_BILLING_SPEC A.3)
// Recibe los webhooks de Stripe (suscripciones del Club), verifica la firma
// sobre el cuerpo CRUDO y actualiza la suscripción + el entitlement por RPC con
// service role. Idempotente por event_id. NO toca el bote de ninguna porra: el
// Club es venta de software, no juego. verify_jwt=false (la firma sustituye al JWT).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyStripe } from "./verify.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "not_configured" }, 503);

  const rawBody = await req.text();
  const v = await verifyStripe(secret, req.headers.get("stripe-signature"), rawBody);
  if (!v.ok) return json({ error: "bad_signature", reason: v.reason }, 401);

  let evt: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try { evt = JSON.parse(rawBody); } catch { return json({ error: "bad_json" }, 400); }
  const eventId = evt.id, type = evt.type;
  if (typeof eventId !== "string" || typeof type !== "string") return json({ error: "bad_event" }, 400);
  const obj = (evt.data?.object ?? {}) as Record<string, unknown>;

  // Normaliza los campos según el tipo de evento de Stripe.
  let user: string | null = null, subId: string | null = null, status: string | null = null;
  let plan: string | null = null, periodEnd: string | null = null, cancel: boolean | null = null;

  const metaUser = (m: unknown) => (m && typeof m === "object" ? (m as Record<string, unknown>).user_id : null);

  if (type.startsWith("customer.subscription.")) {
    subId = str(obj.id);
    status = type.endsWith(".deleted") ? "canceled" : str(obj.status);
    user = str(metaUser(obj.metadata));
    cancel = obj.cancel_at_period_end === true;
    periodEnd = unixToIso(obj.current_period_end);
    plan = planFromItems(obj.items);
  } else if (type === "checkout.session.completed") {
    // El alta: el user_id viaja en metadata; la subscription se confirma luego
    // por customer.subscription.created. Aquí solo registramos el evento.
    user = str(metaUser(obj.metadata));
    subId = str(obj.subscription);
    status = "active";
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  const { data, error } = await admin.rpc("club_apply_event", {
    p_event_id: eventId, p_provider: "stripe", p_type: type, p_payload: obj,
    p_user: user, p_sub_id: subId, p_status: status, p_plan: plan, p_period_end: periodEnd, p_cancel: cancel,
  });
  if (error) { console.error("club_apply_event error"); return json({ error: "server" }, 500); }
  return json(data === false ? { ok: true, duplicate: true } : { ok: true });
});

function str(v: unknown): string | null { return typeof v === "string" && v ? v : null; }
function unixToIso(v: unknown): string | null {
  return typeof v === "number" && v > 0 ? new Date(v * 1000).toISOString() : null;
}
// plan a partir del intervalo del price (year → annual, si no monthly).
function planFromItems(items: unknown): string | null {
  try {
    const d = (items as { data?: Array<{ price?: { recurring?: { interval?: string } } }> })?.data?.[0];
    return d?.price?.recurring?.interval === "year" ? "annual" : "monthly";
  } catch { return null; }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
