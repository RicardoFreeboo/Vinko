import { ImageResponse } from "next/og";
import { TEMPLATES } from "@/lib/templates";
import { EDITORIAL } from "@/lib/editorial";
import { t } from "@/lib/i18n";
import {
  fetchPorraOgData,
  fetchAvatarDataUri,
  fitTitle,
  estimatePillRows,
  pctOf,
  fmtInt,
  initials,
  OG_CACHE_CONTROL,
  MIN_PICKS_THERMO,
  OG_COLORS as C,
  OG_BG_IMAGE,
  OG_ACCENT,
  OG_LETTER,
} from "@/lib/og";

// Miniatura de WhatsApp (F-02): pregunta, opciones, termómetro (solo con ≥ 5
// picks; si no, "Sé el primero"), participantes, creador y marca. 1200×630,
// identidad real de Vinko (verde-negro terminal, verde/oro, mono).
//
// Datos con el cliente anónimo (lo que ve el scraper). Fuente: la de serie de
// next/og (sin descargas). Cero scripts de anuncios: es una PNG.

// Una PNG por porra conocida (plantillas + editoriales); el resto bajo demanda.
export const dynamicParams = true;
export function generateStaticParams() {
  return [...TEMPLATES, ...EDITORIAL].map((p) => ({ slug: p.slug }));
}
// ISR: se regenera como mucho cada 10 min → la miniatura recoge los picks
// nuevos sin que /p/[slug] pague nada. El `?v=` de la URL solo fuerza al
// scraper a volver a pedirla (ver lib/og.ts ogVersion).
export const revalidate = 600;

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Vinko";

type Props = { params: Promise<{ slug: string }> };

// Presupuesto vertical: 630 − 2·PAD = 534 px para cabecera, pregunta, cuerpo y pie.
const PAD = 48;
const INNER_W = size.width - PAD * 2; // 1104
const INNER_H = size.height - PAD * 2; // 534
const HEADER_H = 56;
const FOOTER_H = 44;
const GAPS = 3 * 20;
// Barra del termómetro en px (no en %): un relleno en % dentro de una barra
// flexible se resuelve contra la fila entera y descuadra el layout en Satori.
const BAR_W = 440;
const PCT_W = 96;

export default async function OgImage({ params }: Props) {
  const { slug } = await params;
  const { porra, tallies, total, creator } = await fetchPorraOgData(slug);
  const p = porra && porra.status !== "taken_down" ? porra : null;

  const title = p ? p.title : t("p.notAvailable");
  const options = p ? p.options.slice(0, 4) : [];
  const thermo = !!p && !p.is_template && total >= MIN_PICKS_THERMO && options.length > 0;
  const byOption = new Map(tallies.map((x) => [x.option_id, x.n]));
  const rows = options.map((o, i) => ({
    id: o.id,
    label: o.label,
    accent: OG_ACCENT[i],
    letter: OG_LETTER[i],
    pct: pctOf(byOption.get(o.id) ?? 0, total),
    win: !!p && p.winning_option_id === o.id,
  }));

  // Alto reservado por el cuerpo → el título recibe el resto.
  const rowH = rows.length > 3 ? 44 : 52;
  const pillRows = estimatePillRows(options.map((o) => o.label), 28, INNER_W);
  const bodyH = thermo
    ? rows.length * rowH + (rows.length - 1) * 10
    : pillRows * 60 + Math.max(0, pillRows - 1) * 14;
  const fit = fitTitle(title, {
    maxWidth: INNER_W - 16,
    maxHeight: INNER_H - HEADER_H - FOOTER_H - GAPS - bodyH,
  });

  const avatar = creator ? await fetchAvatarDataUri(creator.avatar_url) : null;
  const who = p?.official ? t("p.badgeOfficial") : creator ? t("og.by", { handle: creator.handle }) : null;
  const whoInitials = p?.official ? "V" : creator ? initials(creator.handle) : null;
  const participants = !p || p.is_template
    ? null
    : total === 0
      ? t("og.first")
      : total === 1
        ? t("og.participantsOne")
        : t("og.participants", { n: fmtInt(total) });
  const badge = p?.is_template
    ? { text: t("p.badgeExample"), color: C.win, filled: false }
    : p?.official
      ? { text: t("p.badgeOfficial"), color: C.win, filled: true }
      : p?.status === "resolved"
        ? { text: t("p.resolved"), color: C.gold, filled: false }
        : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: PAD,
          backgroundColor: C.bg,
          backgroundImage: OG_BG_IMAGE,
          color: C.cream,
          fontFamily: "sans-serif",
        }}
      >
        {/* cabecera: logo real + badge (Ejemplo / Vinko oficial / Resuelta) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: HEADER_H }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width={56} height={56} viewBox="0 0 100 100">
              <path d="M55 22 L59 11 L66 17 L72 8 L78 17 L85 11 L89 22 Z" fill={C.gold} />
              <path
                d="M50 25 C30 25 17 37 17 52 C17 63 23 72 34 77 L30 89 L46 78 Q48 78.4 50 78.4 C70 78.4 83 66 83 51 C83 37 70 25 50 25 Z"
                fill="none"
                stroke={C.cream}
                strokeWidth={5}
              />
              <path d="M35 52 L46 66 L70 38" fill="none" stroke={C.win} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ display: "flex", fontSize: 44, letterSpacing: -1 }}>
              <span style={{ color: C.win }}>v</span>
              <span>inko</span>
            </div>
          </div>
          {badge && (
            <div
              style={{
                display: "flex",
                fontSize: 22,
                letterSpacing: 3,
                color: badge.filled ? C.bg : badge.color,
                backgroundColor: badge.filled ? badge.color : "transparent",
                border: `3px solid ${badge.color}`,
                borderRadius: 999,
                padding: "6px 22px",
                textTransform: "uppercase",
                fontFamily: "monospace",
              }}
            >
              {badge.text}
            </div>
          )}
        </div>

        {/* pregunta: tamaño ajustado a ≤ 3 líneas; lineClamp como red */}
        <div
          style={{
            display: "flex",
            fontSize: fit.fontSize,
            lineHeight: fit.lineHeight,
            letterSpacing: -1.5,
            maxWidth: INNER_W,
            lineClamp: 3,
          }}
        >
          {fit.truncated ? fit.lines.join(" ") : title}
        </div>

        {/* cuerpo: termómetro (≥ 5 picks) o píldoras de opciones */}
        {thermo ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 16, height: rowH }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    border: `3px solid ${r.accent}`,
                    color: r.accent,
                    fontSize: 20,
                    fontFamily: "monospace",
                  }}
                >
                  {r.letter}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexGrow: 1,
                    width: INNER_W - 36 - BAR_W - PCT_W - 3 * 16,
                    fontSize: rows.length > 3 ? 26 : 30,
                    color: r.win ? r.accent : C.cream,
                    lineClamp: 1,
                  }}
                >
                  {r.label}
                </div>
                <div
                  style={{
                    display: "flex",
                    width: BAR_W,
                    height: 18,
                    borderRadius: 999,
                    backgroundColor: C.ink3,
                    border: r.win ? `2px solid ${r.accent}` : `2px solid ${C.line}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: r.pct > 0 ? Math.max(12, Math.round(((BAR_W - 4) * r.pct) / 100)) : 0,
                      height: 14,
                      borderRadius: 999,
                      backgroundColor: r.accent,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    width: PCT_W,
                    fontSize: 32,
                    color: r.accent,
                    fontFamily: "monospace",
                  }}
                >
                  {r.pct}%
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  fontSize: 28,
                  color: r.win ? r.accent : C.cream,
                  backgroundColor: C.ink2,
                  border: `2px solid ${r.accent}`,
                  borderRadius: 16,
                  padding: "10px 22px 10px 14px",
                  maxWidth: INNER_W,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    border: `3px solid ${r.accent}`,
                    color: r.accent,
                    fontSize: 20,
                    fontFamily: "monospace",
                  }}
                >
                  {r.letter}
                </div>
                <div style={{ display: "flex", lineClamp: 1 }}>{r.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* pie: creador · participantes · marca */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: FOOTER_H }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: C.muted }}>
            {who && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} width={40} height={40} style={{ borderRadius: 999 }} alt="" />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      backgroundColor: C.ink3,
                      color: C.win,
                      fontSize: 18,
                      fontFamily: "monospace",
                    }}
                  >
                    {whoInitials}
                  </div>
                )}
                <div style={{ display: "flex", color: C.cream }}>{who}</div>
              </div>
            )}
            {who && participants && <div style={{ display: "flex", color: C.muted2 }}>·</div>}
            {participants && (
              <div style={{ display: "flex", color: thermo ? C.cream : C.win }}>{participants}</div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              letterSpacing: 1.5,
              color: C.muted,
              fontFamily: "monospace",
              textTransform: "uppercase",
            }}
          >
            {t("og.footer")}
          </div>
        </div>
      </div>
    ),
    { ...size, headers: { "Cache-Control": OG_CACHE_CONTROL } },
  );
}
