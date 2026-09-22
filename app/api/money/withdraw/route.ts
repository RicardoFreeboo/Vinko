import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

// POST /api/money/withdraw {poolId} (M0, §B4). Retirarse antes del cierre si el
// país lo permite. El proveedor tramita la devolución; aquí solo se marca la
// referencia (money_withdraw_ref valida estado y política de RG con auth.uid()).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "no_backend" }, { status: 500 });

  const session = await getSession();
  if (!session || session.is_anonymous) return NextResponse.json({ error: "no_auth" }, { status: 401 });

  const { poolId } = await req.json().catch(() => ({}));
  if (typeof poolId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { error } = await sb.rpc("money_withdraw_ref", { p_pool: poolId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
