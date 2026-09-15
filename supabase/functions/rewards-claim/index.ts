// Edge Function: POST /rewards-claim  { impression_id, slot }
// Crédito de recompensas de anuncio SOLO en servidor (spec §4.2/§4.3).
// - El usuario se identifica por su JWT; el slot decide la recompensa
//   (R1 recuperar racha · R2 +PTS · R3 escudo · R4 +XP · R5 análisis 24h ·
//    R6 boost XP 2h). El marcador JAMÁS se toca desde aquí (§0.2).
// - grant_ad_reward_v2() es atómico: +18, topes por slot y globales,
//   idempotente por impression_id. Sin relleno → el house ad acredita igual.
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

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "no_auth" }, 401);

  let impression = "", slot = "R2";
  try {
    const body = await req.json();
    impression = body.impression_id ?? "";
    slot = body.slot ?? "R2";
  } catch { /* noop */ }
  if (!impression) return json({ error: "no_impression" }, 400);
  if (!/^R[1-6]$/.test(slot)) return json({ error: "bad_slot" }, 400);

  const admin = createClient(url, service);
  const { data, error } = await admin.rpc("grant_ad_reward_v2", {
    p_user: user.id,
    p_impression: impression,
    p_slot: slot,
  });
  if (error) return json({ error: error.message }, 400);

  return json(data ?? { granted: 0 });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
