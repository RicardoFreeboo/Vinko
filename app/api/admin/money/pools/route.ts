import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getMoneyConfig, countryCfg } from "@/lib/money/config";
import { getMoneyProvider } from "@/lib/money/provider";

// Adjuntar una bolsa a una porra elegible (M0, bloque B5). No mueve fondos:
// crea la referencia en el proveedor licenciado y guarda solo su id externo.
// Admin en servidor (igual que app/admin/layout.tsx). El proveedor 'mock' solo
// existe fuera de producción; en producción, sin proveedor real → 503.
type PorraSel = {
  id: string; slug: string; closes_at: string; resolution_source_ref: string | null;
  money_eligible: boolean; porra_options: { id: string }[] | null;
};

export async function POST(req: Request) {
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "no_backend" }, { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "no_auth" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const porraId = typeof body.porraId === "string" ? body.porraId : "";
  const country = typeof body.country === "string" ? body.country.toUpperCase() : "";
  const stakeMinor = Math.round(Number(body.stakeMinor));
  const rakeBps = Math.round(Number(body.rakeBps));
  if (!porraId || !/^[A-Z]{2}$/.test(country) || !Number.isInteger(stakeMinor) || stakeMinor <= 0
    || !Number.isInteger(rakeBps) || rakeBps < 0 || rakeBps > 2000) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const cfg = await getMoneyConfig(sb);
  const c = countryCfg(cfg, country);
  if (!c || !c.enabled || !c.legal_basis_ref) return NextResponse.json({ error: "country_off" }, { status: 409 });
  if (Array.isArray(c.stakes_minor) && c.stakes_minor.length > 0 && !c.stakes_minor.includes(stakeMinor)) {
    return NextResponse.json({ error: "bad_stake" }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vinko.fun";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const providerId = c.provider ?? (cfg.env !== "production" ? "mock" : null);
  const provider = getMoneyProvider(providerId, { env: cfg.env, siteUrl, supabaseUrl });
  if (!provider) return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });

  const { data: porraData, error: pErr } = await sb.from("porras")
    .select("id, slug, closes_at, resolution_source_ref, money_eligible, porra_options!porra_options_porra_id_fkey ( id )")
    .eq("id", porraId).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
  const porra = porraData as PorraSel | null;
  if (!porra || !porra.money_eligible || !porra.resolution_source_ref) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const optionsCount = Array.isArray(porra.porra_options) ? porra.porra_options.length : 0;
  const currency = (c.currency ?? "EUR").toUpperCase();

  let externalPoolId: string;
  try {
    const r = await provider.createPool({
      porraId, country, currency, stakeMinor, rakeBps, closesAt: porra.closes_at,
      optionsCount, resolutionSourceRef: porra.resolution_source_ref, createdByUserId: user.id,
    });
    externalPoolId = r.externalPoolId;
  } catch {
    return NextResponse.json({ error: "provider_rejected" }, { status: 502 });
  }

  const { data: poolId, error } = await sb.rpc("money_pool_ref_create", {
    p_porra: porraId, p_country: country, p_provider: providerId, p_external: externalPoolId,
    p_currency: currency, p_stake_minor: stakeMinor, p_rake_bps: rakeBps,
    p_closes_at: porra.closes_at, p_created_by: user.id, p_legal_basis_ref: c.legal_basis_ref,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ poolId }, { status: 200 });
}
