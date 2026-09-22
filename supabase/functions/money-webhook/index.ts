// Edge Function: POST /money-webhook/<provider>
// Recibe los avisos firmados del proveedor de dinero (M0: solo el proveedor
// simulado 'mock' fuera de producción). El módulo está APAGADO: no mueve fondos.
// - verify_jwt=false en el deploy: la firma HMAC sustituye al JWT.
// - Secreto por proveedor en Deno.env MONEY_WEBHOOK_SECRET_<PROVIDER>.
// - Cuerpo CRUDO verificado ANTES de parsear (verify.ts, mismo algoritmo que
//   packages/money-provider/src/signing.ts).
// - Idempotencia por event_id: money_apply_event inserta on conflict do nothing
//   y devuelve false si ya existía (→ 200 duplicate).
// - Errores de datos (VINKO_MONEY_*) → 422 y se guardan con money_event_fail
//   para reintentar desde /admin/money/events. Otros errores → 500 (reintento).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifySignature } from "./verify.ts";

const SIG_HEADER = "x-money-signature";
const PROVIDER_HEADER = "x-money-provider";
const PROVIDER_RX = /^(mock|partner_[a-z0-9_]+|vinko_money)$/;
const TYPES = new Set([
  "participation.confirmed", "participation.failed", "participation.refunded", "participation.paid",
  "pool.closed", "pool.settled", "pool.voided", "kyc.updated", "account.suspended",
]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Proveedor: último segmento de la ruta, o cabecera x-money-provider.
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const seg = path.slice(path.lastIndexOf("/") + 1);
  const provider = PROVIDER_RX.test(seg) ? seg : (req.headers.get(PROVIDER_HEADER) ?? "");
  if (!PROVIDER_RX.test(provider)) return json({ error: "bad_provider" }, 400);

  const secret = Deno.env.get("MONEY_WEBHOOK_SECRET_" + provider.toUpperCase());
  if (!secret) return json({ error: "provider_unavailable" }, 503);

  // Cuerpo CRUDO antes de parsear (la firma cubre el texto exacto).
  const rawBody = await req.text();
  const v = await verifySignature(secret, req.headers.get(SIG_HEADER), rawBody);
  if (!v.ok) return json({ error: "bad_signature", reason: v.reason }, 401);

  let evt: { event_id?: unknown; type?: unknown; payload?: unknown };
  try { evt = JSON.parse(rawBody); } catch { return json({ error: "bad_json" }, 400); }
  const eventId = evt.event_id, type = evt.type;
  if (typeof eventId !== "string" || !eventId) return json({ error: "no_event_id" }, 400);
  if (typeof type !== "string" || !TYPES.has(type)) return json({ error: "bad_type" }, 400);
  const payload = (evt.payload && typeof evt.payload === "object") ? evt.payload : {};

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  const { data, error } = await admin.rpc("money_apply_event", {
    p_event_id: eventId, p_provider: provider, p_type: type, p_payload: payload,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("VINKO_MONEY_")) {
      // Firma válida pero datos no procesables: se guarda para revisión/reintento.
      await admin.rpc("money_event_fail", {
        p_event_id: eventId, p_provider: provider, p_type: type, p_payload: payload, p_error: msg,
      });
      const code = (msg.match(/VINKO_MONEY_[A-Z_]+/) ?? ["VINKO_MONEY_UNKNOWN"])[0];
      return json({ error: "unprocessable", code }, 422);
    }
    // Error transitorio: el proveedor reintenta.
    console.error("money-webhook rpc error");
    return json({ error: "server" }, 500);
  }

  // money_apply_event: true = procesado; false = duplicado (event_id ya visto).
  return json(data === false ? { ok: true, duplicate: true } : { ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
