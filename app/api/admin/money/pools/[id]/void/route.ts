import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getMoneyConfig } from "@/lib/money/config";
import { getMoneyProvider } from "@/lib/money/provider";

// Anular una bolsa (M0, bloque B5). Habla con el proveedor y, si acepta, marca
// la referencia como 'voided' (money_pool_ref_set_status). No mueve fondos: la
// devolución de entradas la ejecuta el proveedor licenciado. Admin en servidor
// (igual que app/admin/layout.tsx).
type PoolSel = { id: string; provider: string; external_pool_id: string | null; status: string };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "no_backend" }, { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "no_auth" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reason = (typeof body.reason === "string" ? body.reason.trim() : "").slice(0, 200) || "void";

  const { data: poolData, error: poolErr } = await sb.from("money_pools")
    .select("id, provider, external_pool_id, status").eq("id", id).maybeSingle();
  if (poolErr) return NextResponse.json({ error: poolErr.message }, { status: 400 });
  const pool = poolData as PoolSel | null;
  if (!pool) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const cfg = await getMoneyConfig(sb);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vinko.fun";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const provider = getMoneyProvider(pool.provider, { env: cfg.env, siteUrl, supabaseUrl });
  if (!provider) return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });

  // Con id externo ya avisamos al proveedor; sin él (borrador) solo se marca.
  if (pool.external_pool_id) {
    let accepted = false;
    try {
      const r = await provider.voidPool({ externalPoolId: pool.external_pool_id, reason });
      accepted = !!r.accepted;
    } catch {
      return NextResponse.json({ error: "provider_rejected" }, { status: 502 });
    }
    if (!accepted) return NextResponse.json({ error: "provider_rejected" }, { status: 502 });
  }

  const { error } = await sb.rpc("money_pool_ref_set_status", { p_pool: id, p_status: "voided" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
