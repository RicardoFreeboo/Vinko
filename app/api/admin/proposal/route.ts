import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Publicar / descartar una candidata, desde el servidor con la sesión del admin.
// publish_proposal usa auth.uid() (la sesión de cookies) → is_admin funciona.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "no_backend" }, { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "no_auth" }, { status: 401 });
  const { data: isAdmin } = await sb.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { action, id, slug } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  if (action === "discard") {
    // RPC de 0032 (deja la señal de origen rechazada); si aún no existe, estado "discarded" (el único que admite el CHECK de 0001).
    const r1 = await sb.rpc("reject_proposal", { p_id: id });
    const { error } = r1.error ? await sb.from("topic_proposals").update({ status: "discarded" }).eq("id", id) : r1;
    return NextResponse.json({ ok: !error, error: error?.message });
  }

  const { data, error } = await sb.rpc("publish_proposal", { p_id: id, p_slug: slug ?? "porra" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, porra: data });
}
