import { ImageResponse } from "next/og";
import { supabaseServer } from "@/lib/supabase/server";
import { RecapCard, RECAP_SIZES, type RecapData } from "@/app/g/[id]/recap-card";

// El resumen de la semana en PNG (R-02): 1200×630 para WhatsApp y
// ?format=story → 1080×1920. ?c=<código de invitación> permite que el crawler
// de WhatsApp descargue la imagen sin sesión (es el mismo secreto del enlace
// que se comparte); ?u=<handle> añade "tu posición". Caché 10 min.
// Sin backend o sin acceso → tarjeta "no disponible" (404) para no romper el
// enlace compartido.
export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE_RX = /^[a-z0-9_]{3,24}$/i;
const CODE_RX = /^[a-z0-9]{4,32}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const format = q.get("format") === "story" ? "story" : "wa";
  const code = q.get("c");
  const handle = q.get("u");
  const { width, height } = RECAP_SIZES[format];

  let data: RecapData | null = null;
  if (UUID_RX.test(id)) {
    const sb = await supabaseServer();
    if (sb) {
      const { data: d } = await sb.rpc("group_recap", {
        p_group: id,
        p_code: code && CODE_RX.test(code) ? code.toLowerCase() : null,
        p_handle: handle && HANDLE_RX.test(handle) ? handle.toLowerCase() : null,
      });
      data = (d as RecapData | null) ?? null;
    }
  }

  const safeCode = code && CODE_RX.test(code) ? code.toLowerCase() : null;
  return new ImageResponse(<RecapCard data={data} format={format} code={safeCode} />, {
    width,
    height,
    status: data ? 200 : 404,
    headers: {
      "Cache-Control": data
        ? "public, max-age=600, s-maxage=600, stale-while-revalidate=60"
        : "no-store",
    },
  });
}
