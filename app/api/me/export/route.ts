import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// GET /api/me/export — descarga JSON con los datos del usuario (RGPD: acceso y
// portabilidad, spec F-10). Usa la sesión del propio usuario: primero la RPC
// export_me() (0037, security definer filtrada por auth.uid()); si aún no está
// aplicada, selects bajo RLS con lo esencial (perfil, picks, porras creadas,
// comentarios, avisos). Nunca cacheable.
export const dynamic = "force-dynamic";

type Payload = Record<string, unknown>;

export async function GET() {
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "no_backend" }, { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "no_auth" }, { status: 401 });

  let data: Payload | null = null;
  const rpc = await sb.rpc("export_me");
  if (!rpc.error && rpc.data && typeof rpc.data === "object") {
    data = rpc.data as Payload;
  } else {
    const [profile, picks, porras, comments, notifications] = await Promise.all([
      sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      sb.from("picks").select("porra_id, option_id, points_spent, created_at").eq("user_id", user.id),
      sb.from("porras").select("*").eq("created_by", user.id),
      sb.from("porra_comments").select("porra_id, body, created_at").eq("user_id", user.id),
      sb.from("notifications").select("class, title, body, url, created_at, read_at").eq("user_id", user.id),
    ]);
    data = {
      profile: profile.data ?? null,
      picks: picks.data ?? [],
      porras_created: porras.data ?? [],
      comments: comments.data ?? [],
      notifications: notifications.data ?? [],
    };
  }

  const body = {
    format: "vinko-export-v1",
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      provider: (user.app_metadata as { provider?: string } | undefined)?.provider ?? null,
      created_at: user.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
    },
    ...data,
  };

  const handle = (data.profile as { handle?: string } | null)?.handle ?? "usuario";
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="vinko-datos-${handle}-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
