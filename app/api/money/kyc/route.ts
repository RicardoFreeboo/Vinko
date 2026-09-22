import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { moneyForPool } from "@/lib/money/server";
import { getMoneyProvider } from "@/lib/money/provider";
import { getMoneyConfig } from "@/lib/money/config";
import { SITE } from "@/lib/share";

// POST /api/money/kyc {poolId} (M0, §B4). Arranca la verificación de identidad
// del proveedor (KYC lo hace el operador licenciado, nunca Vinko) y devuelve la
// URL a la que redirigir. La caché de elegibilidad la escribe el webhook.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "no_backend" }, { status: 500 });

  const session = await getSession();
  if (!session || session.is_anonymous) return NextResponse.json({ error: "no_auth" }, { status: 401 });

  const { poolId } = await req.json().catch(() => ({}));
  if (typeof poolId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const view = await moneyForPool(poolId, session);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // No arrancar KYC si hay un bloqueo duro (menor, autoexcluido, kill switch, geo,
  // país apagado): la verificación no lo resolvería y no debe ofrecerse. Solo se
  // permite cuando el KYC (o un tope temporal) es lo único que falta. Regla de oro 8.
  const hardBlock = !view.eligibility.eligible &&
    view.eligibility.reasons.some((r) => r !== "kyc_required" && r !== "kyc_pending" && r !== "limit_reached");
  if (hardBlock) return NextResponse.json({ error: "not_eligible", reasons: view.eligibility.reasons }, { status: 403 });

  const cfg = await getMoneyConfig(sb);
  const provider = getMoneyProvider(view.provider, {
    env: cfg.env,
    siteUrl: SITE,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  });
  if (!provider) return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });

  const { url } = await provider.startKyc(session.id, view.country, `${SITE}/p/${view.porraSlug}`);
  return NextResponse.json({ url });
}
