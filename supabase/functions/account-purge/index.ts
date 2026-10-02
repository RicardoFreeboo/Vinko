// FX-15 · Borrado REAL de la cuenta de auth. delete_me() (0037) anonimiza el
// perfil y marca deleted_at; esta función remata: verifica la sesión del que
// llama, comprueba que su perfil ya está marcado como borrado y elimina el
// usuario de auth.users con la service role (el email queda libre y ese login
// deja de existir). Se invoca desde Ajustes justo después de delete_me.
//
// Desplegar: supabase functions deploy account-purge
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("method", { status: 405, headers: cors });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!url || !service || !jwt) return new Response("auth", { status: 401, headers: cors });

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // ¿Quién llama? El JWT de SU sesión, verificado en el servidor de auth.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (userErr || !uid) return new Response("auth", { status: 401, headers: cors });

  // Solo se purga una cuenta que YA pasó por delete_me (perfil anonimizado).
  const { data: prof } = await admin
    .from("profiles").select("deleted_at").eq("id", uid).maybeSingle();
  if (!prof?.deleted_at) {
    return new Response(JSON.stringify({ ok: false, reason: "not_marked" }), {
      status: 409, headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "content-type": "application/json" },
  });
});
