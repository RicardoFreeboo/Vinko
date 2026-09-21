import { ImageResponse } from "next/og";
import { t } from "@/lib/i18n";
import {
  fetchProfileOgData,
  fetchAvatarDataUri,
  fmtInt,
  initials,
  levelFromXp,
  pctOf,
  OG_CACHE_CONTROL,
  OG_COLORS as C,
  OG_BG_IMAGE,
} from "@/lib/og";

// Tarjeta de presentación del perfil (F-02 / F-07): handle, Puntería, nivel,
// liga y % de acierto. Datos anónimos: profiles (lectura pública) +
// profile_stats (anon). Si el handle no existe → tarjeta genérica de Vinko.

// ISR 10 min, como la OG de /p/[slug].
export const revalidate = 600;

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Vinko";

type Props = { params: Promise<{ handle: string }> };

const PAD = 48;
const MIN_PLAYED_FOR_PCT = 3; // con 1 o 2 porras el % dice poco

export default async function OgImage({ params }: Props) {
  const { handle } = await params;
  const p = await fetchProfileOgData(decodeURIComponent(handle));
  const avatar = p ? await fetchAvatarDataUri(p.avatar_url) : null;
  const level = p ? levelFromXp(p.xp) : 1;
  const subtitle = p ? (p.title ?? t("level.title", { n: String(level) })) : null;
  const acc = !p
    ? null
    : p.played >= MIN_PLAYED_FOR_PCT
      ? { v: `${pctOf(p.hits, p.played)}%`, l: t("og.u.accuracy") }
      : { v: fmtInt(p.played), l: t("og.u.played") };

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
        {/* cabecera: logo + liga */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
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
          {p && (
            <div
              style={{
                display: "flex",
                fontSize: 22,
                letterSpacing: 3,
                color: C.gold,
                border: `3px solid ${C.gold}`,
                borderRadius: 999,
                padding: "6px 22px",
                textTransform: "uppercase",
                fontFamily: "monospace",
              }}
            >
              {t(`og.div.${p.division}`)}
            </div>
          )}
        </div>

        {p ? (
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} width={150} height={150} style={{ borderRadius: 999 }} alt="" />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 150,
                  height: 150,
                  borderRadius: 999,
                  backgroundColor: C.ink3,
                  border: `4px solid ${C.win}`,
                  color: C.win,
                  fontSize: 64,
                  fontFamily: "monospace",
                }}
              >
                {initials(p.handle)}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 880 }}>
              <div style={{ display: "flex", fontSize: 76, letterSpacing: -2, lineClamp: 1 }}>@{p.handle}</div>
              <div style={{ display: "flex", fontSize: 32, color: C.gold, lineClamp: 1 }}>{subtitle}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 54, letterSpacing: -1.5, lineClamp: 2, maxWidth: 1000 }}>
            {t("og.description")}
          </div>
        )}

        {/* estadísticas: Puntería · Nivel · acierto (o porras jugadas) */}
        {p && acc && (
          <div style={{ display: "flex", gap: 16 }}>
            {[
              { v: fmtInt(p.marcador_total), l: t("saldo.skill"), c: C.cream },
              { v: String(level), l: t("saldo.level"), c: C.win },
              { v: acc.v, l: acc.l, c: C.gold },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flexGrow: 1,
                  height: 128,
                  borderRadius: 18,
                  backgroundColor: C.ink2,
                  border: `2px solid ${C.line}`,
                }}
              >
                <div style={{ display: "flex", fontSize: 56, color: s.c, fontFamily: "monospace" }}>{s.v}</div>
                <div style={{ display: "flex", fontSize: 20, letterSpacing: 2, color: C.muted, textTransform: "uppercase" }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* pie: CTA + marca */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
          <div style={{ display: "flex", fontSize: 26, color: p ? C.win : C.muted }}>
            {p ? t("og.u.cta", { handle: p.handle }) : ""}
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
