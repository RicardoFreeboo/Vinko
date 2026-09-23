import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { SITE } from "@/lib/share";

// POST /api/club/portal → Stripe Customer Portal (cambiar tarjeta, cancelar, ver
// facturas). Cero UI propia de facturación (VINKO_BILLING_SPEC A.3). Requiere
// STRIPE_SECRET_KEY y que el usuario tenga stripe_customer_id.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const sb = await supabaseServer();
  const session = await getSession();
  if (!sb || !session || session.is_anonymous) return NextResponse.json({ error: "no_auth" }, { status: 401 });

  const { data: bc } = await sb.from("billing_customers").select("stripe_customer_id").eq("user_id", session.id).maybeSingle();
  const customer = (bc as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (!customer) return NextResponse.json({ error: "no_customer" }, { status: 400 });

  try {
    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ customer, return_url: `${SITE}/saldo` }).toString(),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: "stripe" }, { status: 502 });
    return NextResponse.json({ url: (j as { url?: string }).url });
  } catch {
    return NextResponse.json({ error: "stripe" }, { status: 502 });
  }
}
