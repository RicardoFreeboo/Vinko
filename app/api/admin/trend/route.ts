import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Dispara el agente (barrido, renovar, búsqueda por tema o diagnóstico) desde
// el servidor, usando la SESIÓN de cookies del admin (robusto: no depende del
// token en el navegador). Verifica admin y llama a trend-generate con el
// secreto del cron. Cuerpos que acepta trend-generate v3:
//   { topic }            búsqueda dirigida
//   { limit, force }     barrido (force = "Renovar", ignora titulares ya vistos)
//   { debug, topic }     diagnóstico de fuentes y filtros (no genera nada)
export async function POST(req: Request) {
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "no_backend" }, { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "no_auth" }, { status: 401 });
  const { data: isAdmin } = await sb.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) return NextResponse.json({ error: "no_config" }, { status: 500 });

  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 120) : "";
  const force = body.force === true;
  const debug = body.debug === true;
  // (Antes se mandaba limit:5 fijo, por eso el panel sacaba tan pocas.)
  const limit = Math.min(Math.max(Number(body.limit) || 18, 1), 30);
  const payload = debug ? { debug: true, topic } : topic ? { topic } : { limit, force };

  const res = await fetch(`${url}/functions/v1/trend-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": secret },
    body: JSON.stringify(payload),
  });
  const j = await res.json().catch(() => ({}));
  return NextResponse.json(j, { status: res.ok ? 200 : res.status });
}
