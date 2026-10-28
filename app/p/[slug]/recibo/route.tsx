import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchMe } from "@/lib/me";
import { t } from "@/lib/i18n";

// RECIBO PARA COMPARTIR (VINKO_PANTALLAS 09): «LO DIJE.» en una PNG 1080×1350
// que el móvil manda como imagen (Web Share con archivo, desde ResultView).
// Solo de TU acierto: se lee con tu sesión (RLS: tu propio pick); sin sesión,
// sin resolver o si fallaste → 404. Es tuyo: nada de caché pública.
// Fuentes OFL en lib/og-fonts (la de serie de next/og solo trae el peso 400 y
// el «LO DIJE.» del diseño es black). Solo latín: nada de «→» en el texto, la
// flecha se dibuja.
export const dynamic = "force-dynamic";

const W = 1080;
const H = 1350;
const INK = "#0c1011";
const CREAM = "#f4f1e9";
const GREEN = "#1fe07a";
const GOLD = "#ffc23d";

let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700 | 900 }[]> | null = null;
function loadFonts() {
  const dir = join(process.cwd(), "lib/og-fonts");
  fonts ??= Promise.all([
    readFile(join(dir, "inter-900.woff")).then((data) => ({ name: "Inter", data, weight: 900 as const })),
    readFile(join(dir, "mono-500.woff")).then((data) => ({ name: "Mono", data, weight: 500 as const })),
    readFile(join(dir, "mono-700.woff")).then((data) => ({ name: "Mono", data, weight: 700 as const })),
  ]);
  return fonts;
}

// «22 OCT 2026» en la zona del usuario.
function fecha(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: tz, day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(iso)).replace(/\./g, "").replace(/\sde\s/g, " ").replace(/[\u00a0\u202f]/g, " ").toUpperCase();
}

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await supabaseServer();
  if (!sb) return notFound();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(null, { status: 401, headers: { "Cache-Control": "private, no-store" } });

  const { data: po } = await sb.from("porras")
    .select("id, title, status, winning_option_id, porra_options!porra_options_porra_id_fkey ( id, label )")
    .eq("slug", slug).maybeSingle();
  if (!po || po.status !== "resolved" || !po.winning_option_id) return notFound();
  const { data: mp } = await sb.from("picks")
    .select("option_id, pct_at_pick, visionario, receipt_no, created_at")
    .eq("porra_id", po.id).eq("user_id", user.id).maybeSingle();
  if (!mp || mp.option_id !== po.winning_option_id) return notFound();

  const me = await fetchMe(sb);
  const handle = me?.handle ?? "yo";
  const tz = me?.tz ?? "America/Bogota";
  const options = (po.porra_options ?? []) as { id: string; label: string }[];
  const said = (options.find((o) => o.id === mp.option_id)?.label ?? "").toUpperCase();
  const pct = typeof mp.pct_at_pick === "number" ? mp.pct_at_pick : null;
  const [l1, ...rest] = t("result.wonTitle").toUpperCase().split(" ");
  const qSize = po.title.length > 100 ? 40 : po.title.length > 70 ? 46 : 54;
  // «Dije X» va en una línea de mono: las opciones largas (hasta 40) se encogen.
  const saidSize = said.length > 28 ? 28 : said.length > 22 ? 34 : 40;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", position: "relative", background: GREEN, fontFamily: "Inter" }}>
        {/* círculo decorativo arriba a la derecha */}
        <div style={{ position: "absolute", right: -260, top: -300, width: 700, height: 700, borderRadius: 9999, background: "rgba(12,16,17,0.07)" }} />
        {/* sombra sólida desplazada + tarjeta */}
        <div style={{ position: "absolute", left: 96, top: 174, width: 936, height: 960, borderRadius: 48, background: INK }} />
        <div style={{
          position: "absolute", left: 72, top: 150, width: 936, height: 960, borderRadius: 48, background: CREAM, overflow: "hidden",
          border: `10px solid ${INK}`, display: "flex", flexDirection: "column", padding: "58px 56px 48px",
        }}>
          <div style={{ display: "flex", flexShrink: 0, justifyContent: "space-between", fontFamily: "Mono", fontWeight: 500, fontSize: 34, letterSpacing: 4, color: INK }}>
            <span>{t("receipt09.no", { n: String(mp.receipt_no ?? 0).padStart(4, "0") }).toUpperCase()}</span>
            <span>{fecha(mp.created_at, tz)}</span>
          </div>
          <div style={{ display: "flex", flexShrink: 0, flexDirection: "column", marginTop: 26, fontSize: 180, fontWeight: 900, lineHeight: 0.86, letterSpacing: -8, color: INK }}>
            <span>{l1}</span>
            <span>{rest.join(" ")}</span>
          </div>
          <div style={{ display: "flex", flexShrink: 0, marginTop: 36, fontSize: qSize, fontWeight: 900, lineHeight: 1.12, letterSpacing: -1.5, color: INK }}>
            {po.title}
          </div>
          <div style={{ display: "flex", flexShrink: 0, flexDirection: "column", marginTop: 28, fontFamily: "Mono", fontSize: 40, lineHeight: 1.45, color: INK }}>
            <div style={{ display: "flex", fontSize: saidSize }}>
              <span style={{ fontWeight: 500 }}>{t("receipt09.said")}&nbsp;</span>
              <span style={{ fontWeight: 700 }}>{said}</span>
            </div>
            {pct !== null && (
              <div style={{ display: "flex" }}>
                <span style={{ fontWeight: 500 }}>{t("receipt09.only")}&nbsp;</span>
                <span style={{ fontWeight: 700 }}>{pct} %</span>
                <span style={{ fontWeight: 500 }}>&nbsp;{t("receipt09.thought")}</span>
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          {/* línea perforada */}
          <div style={{ display: "flex", flexShrink: 0, justifyContent: "space-between", marginBottom: 32 }}>
            {Array.from({ length: 26 }, (_, i) => (
              <div key={i} style={{ width: 20, height: 5, borderRadius: 3, background: "rgba(12,16,17,0.3)" }} />
            ))}
          </div>
          <div style={{ display: "flex", flexShrink: 0, justifyContent: "space-between", alignItems: "center", fontSize: 48, fontWeight: 900, color: INK }}>
            <span>@{handle}</span>
            <div style={{ display: "flex", alignItems: "center" }}>
              <svg width="62" height="62" viewBox="0 0 100 100">
                <path d="M55 22 L59 11 L66 17 L72 8 L78 17 L85 11 L89 22 Z" fill={GOLD} />
                <path d="M50 25 C30 25 17 37 17 52 C17 63 23 72 34 77 L30 89 L46 78 Q48 78.4 50 78.4 C70 78.4 83 66 83 51 C83 37 70 25 50 25 Z" fill="none" stroke={INK} strokeWidth="5" />
                <path d="M35 52 L46 66 L70 38" fill="none" stroke={GREEN} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ marginLeft: 18 }}>vinko.fun</span>
            </div>
          </div>
        </div>
        {/* sello VISIONARIO, torcido sobre la tarjeta */}
        {mp.visionario && (
          <div style={{
            position: "absolute", right: 120, top: 318, display: "flex", padding: "18px 34px", borderRadius: 18,
            background: GOLD, border: `9px solid ${INK}`, transform: "rotate(-8deg)",
            fontSize: 54, fontWeight: 900, letterSpacing: 3, color: INK,
          }}>
            {t("result.visionario").toUpperCase()}
          </div>
        )}
        {/* llamada a votar la siguiente */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 1196, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 54, fontWeight: 900, color: INK, letterSpacing: -1 }}>
          <span>{t("receipt09.cta")}</span>
          <svg width="52" height="52" viewBox="0 0 24 24" style={{ marginLeft: 14 }}>
            <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: await loadFonts(),
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
