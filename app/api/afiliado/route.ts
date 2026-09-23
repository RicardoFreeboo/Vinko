import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Redirección de afiliación a un operador licenciado (regla de oro 5). Valida
// elegibilidad y registra el clic en el servidor (affiliate_go), y responde 302
// a la URL del operador con el subid ya resuelto (un hash, nunca el id en claro).
// Vinko no gestiona el juego ni el dinero: solo manda el tráfico. Apagado por
// defecto (affiliate.enabled=false en todos los países): entonces redirige a /.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const op = (url.searchParams.get("op") ?? "").trim();
  const country = (url.searchParams.get("c") ?? "").trim();
  const porra = url.searchParams.get("p");
  const home = new URL("/", req.url);

  const sb = await supabaseServer();
  if (!sb || !op || !country) return NextResponse.redirect(home, { status: 302 });

  const { data, error } = await sb.rpc("affiliate_go", {
    p_operator: op,
    p_country: country,
    p_porra: porra && /^[0-9a-f-]{36}$/i.test(porra) ? porra : null,
  });
  if (error || typeof data !== "string" || !/^https?:\/\//i.test(data)) {
    return NextResponse.redirect(new URL("/?afiliado=off", req.url), { status: 302 });
  }
  return NextResponse.redirect(data, { status: 302 });
}
