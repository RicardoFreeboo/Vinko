import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { moneyForPool } from "@/lib/money/server";
import { getMoneyProvider } from "@/lib/money/provider";
import { getMoneyConfig } from "@/lib/money/config";
import { SITE } from "@/lib/share";

// POST /api/money/join {poolId, optionIdx} (M0, §B4). Sesión NO anónima →
// moneyForPool → elegibilidad → proveedor → provider.join → money_join_ref.
// Devuelve la URL del cajero del proveedor (Vinko nunca cobra la entrada).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "no_backend" }, { status: 500 });

  const session = await getSession();
  if (!session || session.is_anonymous) return NextResponse.json({ error: "no_auth" }, { status: 401 });

  const { poolId, optionIdx } = await req.json().catch(() => ({}));
  if (typeof poolId !== "string" || typeof optionIdx !== "number" || !Number.isInteger(optionIdx)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const view = await moneyForPool(poolId, session);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!view.eligibility.eligible) {
    return NextResponse.json({ error: "not_eligible", reasons: view.eligibility.reasons }, { status: 403 });
  }
  if (!view.externalPoolId) return NextResponse.json({ error: "pool_not_open" }, { status: 409 });

  const cfg = await getMoneyConfig(sb);
  const provider = getMoneyProvider(view.provider, {
    env: cfg.env,
    siteUrl: SITE,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  });
  if (!provider) return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });

  const { cashierUrl, participationRef } = await provider.join({
    externalPoolId: view.externalPoolId,
    userId: session.id,
    optionIdx,
    returnUrl: `${SITE}/p/${view.porraSlug}`,
  });

  const { error } = await sb.rpc("money_join_ref", { p_pool: poolId, p_option_idx: optionIdx, p_external_ref: participationRef });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ cashierUrl });
}
