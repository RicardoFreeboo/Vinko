import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Estructura lo dictado (transcript) en {pregunta, opciones} con Haiku, desde el
// servidor. Requiere sesión. Llama a la Edge Function con el cron secret.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "no_backend" }, { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "no_auth" }, { status: 401 });

  const { transcript } = await req.json().catch(() => ({}));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) return NextResponse.json({ error: "no_config" }, { status: 500 });

  const res = await fetch(`${url}/functions/v1/voice-porra`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": secret },
    body: JSON.stringify({ transcript }),
  });
  const j = await res.json().catch(() => ({}));
  return NextResponse.json(j, { status: res.ok ? 200 : res.status });
}
