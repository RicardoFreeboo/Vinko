// Edge Function: POST /rewards/claim  { impression_id }
// PASO 6b — crédito de puntos por anuncio SOLO en servidor.
// - El usuario se identifica por su JWT (Authorization: Bearer), no por el body.
// - amount fijo a 10 en servidor (el cliente no elige cuánto).
// - grant_ad_reward() es atómico: +18, cap 5/día, idempotente por impression_id.
// Desplegar: supabase functions deploy rewards-claim
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) identificar al usuario por su token
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "no_auth" }, 401);

  // 2) impression_id del body (idempotencia)
  let impression = "";
  try { impression = (await req.json()).impression_id ?? ""; } catch { /* noop */ }
  if (!impression) return json({ error: "no_impression" }, 400);

  // 3) crédito atómico con service role (amount fijo en el servidor = 10)
  const admin = createClient(url, service);
  const { data, error } = await admin.rpc("grant_ad_reward", {
    p_user: user.id,
    p_impression: impression,
  });
  if (error) return json({ error: error.message }, 400);

  return json({ granted: data ?? 0 });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
