import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { mockEvent } from "@/packages/money-provider/src";
import { postSignedWebhook } from "@/lib/money/provider";

// Rutas del cajero SIMULADO (M0, solo fuera de producción). Traducen los botones
// del cajero de pruebas en un aviso firmado hacia el webhook, como haría el
// proveedor real. No mueven dinero. action ∈ confirm | fail | kyc.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeReturn(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/feed";
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const secret = process.env.MONEY_WEBHOOK_SECRET_MOCK;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if ((process.env.VERCEL_ENV ?? "") === "production" || !secret || !supaUrl) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const session = await getSession();
  if (!session || session.is_anonymous) return NextResponse.json({ error: "no_auth" }, { status: 401 });

  // Producción también según la config de negocio (misc.env), no solo VERCEL_ENV.
  const sb = await supabaseServer();
  const { data: misc } = sb ? await sb.from("remote_config").select("value").eq("key", "misc").maybeSingle() : { data: null };
  if (((misc?.value as { env?: string } | null)?.env ?? "production") === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { action } = await params;
  const form = await req.formData();
  const ret = safeReturn(form.get("return"));

  let evt;
  if (action === "confirm" || action === "fail") {
    const pool = String(form.get("pool") ?? "");
    const ref = String(form.get("ref") ?? "");
    if (!pool || !ref) return NextResponse.json({ error: "bad_input" }, { status: 400 });
    evt = mockEvent(action === "confirm" ? "participation.confirmed" : "participation.failed", {
      external_pool_id: pool, participation_ref: ref, ...(action === "fail" ? { reason: "mock_fail" } : {}),
    });
  } else if (action === "kyc") {
    // Siempre el usuario de la sesión, nunca el campo del formulario (evita suplantar a otro).
    evt = mockEvent("kyc.updated", {
      user_id: session.id, country: String(form.get("country") ?? ""), kyc_status: "verified",
    });
  } else {
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }

  const webhookUrl = `${supaUrl.replace(/\/+$/, "")}/functions/v1/money-webhook/mock`;
  try {
    await postSignedWebhook(webhookUrl, secret, evt);
  } catch {
    /* el proveedor real reintentaría; en pruebas seguimos al retorno igualmente */
  }
  return NextResponse.redirect(new URL(ret, req.url), 303);
}
