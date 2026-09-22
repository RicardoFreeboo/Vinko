import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getMoneyConfig } from "@/lib/money/config";
import { getMoneyProvider } from "@/lib/money/provider";

// Liquidar una bolsa (M0, bloque B5). Exige resultado fijado en la fuente
// oficial (results_feed): el juez humano nunca decide una porra con bolsa.
// Habla con el proveedor; si acepta, el estado lo cambia el webhook
// (pool.settled). Si el proveedor rechaza, el estado no cambia (502). Admin en
// servidor (igual que app/admin/layout.tsx).
type PoolSel = { id: string; provider: string; external_pool_id: string | null; porra_id: string; status: string };

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "no_backend" }, { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "no_auth" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: poolData, error: poolErr } = await sb.from("money_pools")
    .select("id, provider, external_pool_id, porra_id, status").eq("id", id).maybeSingle();
  if (poolErr) return NextResponse.json({ error: poolErr.message }, { status: 400 });
  const pool = poolData as PoolSel | null;
  if (!pool) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!pool.external_pool_id) return NextResponse.json({ error: "bad_status" }, { status: 409 });

  // El resultado SOLO viene de la fuente oficial de la porra.
  const { data: porra } = await sb.from("porras").select("resolution_source_ref").eq("id", pool.porra_id).maybeSingle();
  const sourceRef = (porra as { resolution_source_ref: string | null } | null)?.resolution_source_ref ?? null;
  if (!sourceRef) return NextResponse.json({ error: "no_result" }, { status: 409 });
  const { data: feed } = await sb.from("results_feed").select("result_option_idx").eq("key", sourceRef).maybeSingle();
  const winningOptionIdx = (feed as { result_option_idx: number | null } | null)?.result_option_idx ?? null;
  if (winningOptionIdx == null) return NextResponse.json({ error: "no_result" }, { status: 409 });

  const cfg = await getMoneyConfig(sb);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vinko.fun";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const provider = getMoneyProvider(pool.provider, { env: cfg.env, siteUrl, supabaseUrl });
  if (!provider) return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });

  let accepted = false;
  try {
    const r = await provider.settle({ externalPoolId: pool.external_pool_id, winningOptionIdx, resultSourceRef: sourceRef });
    accepted = !!r.accepted;
  } catch {
    return NextResponse.json({ error: "provider_rejected" }, { status: 502 });
  }
  // Si el proveedor acepta, deja que el webhook (pool.settled) cambie el estado.
  if (!accepted) return NextResponse.json({ error: "provider_rejected" }, { status: 502 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
