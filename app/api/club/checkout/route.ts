import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { getClubConfig } from "@/lib/club";
import { SITE } from "@/lib/share";

// POST /api/club/checkout { plan: "monthly" | "annual" }  (VINKO_BILLING_SPEC A.3)
// Crea una Stripe Checkout Session (modo subscription). El pago ocurre en Stripe,
// no en Vinko (PCI mínimo). El importe es la cuota del Club, NUNCA depende de una
// porra. Requiere STRIPE_SECRET_KEY en el entorno; si falta, 503 (Club apagado).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE = "https://api.stripe.com/v1";

async function stripe(path: string, key: string, form: Record<string, string>) {
  const res = await fetch(`${STRIPE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: { message?: string } })?.error?.message ?? `stripe_${res.status}`);
  return data as Record<string, unknown>;
}

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const sb = await supabaseServer();
  const session = await getSession();
  if (!sb || !session || session.is_anonymous) return NextResponse.json({ error: "no_auth" }, { status: 401 });

  const { plan } = (await req.json().catch(() => ({}))) as { plan?: string };
  const period = plan === "annual" ? "annual" : "monthly";
  const cfg = await getClubConfig(sb);
  if (!cfg.enabled) return NextResponse.json({ error: "disabled" }, { status: 403 });
  const amount = period === "annual" ? cfg.annual_minor : cfg.monthly_minor;
  const interval = period === "annual" ? "year" : "month";

  try {
    // Cliente de Stripe: reutiliza el guardado o crea uno nuevo.
    const { data: bc } = await sb.from("billing_customers").select("stripe_customer_id").eq("user_id", session.id).maybeSingle();
    let customer = (bc as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null;
    if (!customer) {
      const c = await stripe("/customers", key, {
        ...(session.email ? { email: session.email } : {}),
        "metadata[user_id]": session.id,
      });
      customer = c.id as string;
      await sb.rpc("club_set_customer", { p_user: session.id, p_stripe: customer, p_paypal: null });
    }

    const cs = await stripe("/checkout/sessions", key, {
      mode: "subscription",
      customer,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": cfg.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][recurring][interval]": interval,
      "line_items[0][price_data][product_data][name]": "Vinko Club",
      "subscription_data[metadata][user_id]": session.id,
      "metadata[user_id]": session.id,
      success_url: `${SITE}/saldo?club=ok`,
      cancel_url: `${SITE}/saldo?club=cancel`,
    });
    return NextResponse.json({ url: cs.url });
  } catch (e) {
    return NextResponse.json({ error: "stripe", detail: String(e).slice(0, 200) }, { status: 502 });
  }
}
