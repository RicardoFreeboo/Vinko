import { ImageResponse } from "next/og";
import { getPorraBySlug } from "@/lib/porras";
import { TEMPLATES } from "@/lib/templates";
import { EDITORIAL } from "@/lib/editorial";
import { t } from "@/lib/i18n";

// Una PNG por porra conocida; el resto se generan bajo demanda.
export const dynamicParams = true;
export function generateStaticParams() {
  return [...TEMPLATES, ...EDITORIAL].map((p) => ({ slug: p.slug }));
}

// Miniatura de WhatsApp con la identidad REAL de Vinko: verde-negro terminal,
// logo bocadillo+check+corona, verde/oro, mono. 1200×630.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Vinko";

type Props = { params: Promise<{ slug: string }> };

const ACCENT = ["#1fe07a", "#ffc23d", "#1fe07a", "#ffc23d"];

export default async function OgImage({ params }: Props) {
  const { slug } = await params;
  const porra = await getPorraBySlug(slug);
  const title =
    porra && porra.status !== "taken_down" ? porra.title : t("p.notAvailable");
  const options =
    porra && porra.status !== "taken_down" ? porra.options.slice(0, 4) : [];
  const titleSize = title.length > 60 ? 56 : title.length > 40 ? 66 : 78;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          backgroundColor: "#0c1011",
          backgroundImage:
            "radial-gradient(60% 45% at 50% 0%, rgba(31,224,122,0.16), transparent 60%), radial-gradient(55% 45% at 95% 100%, rgba(255,194,61,0.13), transparent 60%)",
          color: "#f4f1e9",
          fontFamily: "sans-serif",
        }}
      >
        {/* cabecera: logo real + badge Ejemplo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width={64} height={64} viewBox="0 0 100 100">
              <path d="M55 22 L59 11 L66 17 L72 8 L78 17 L85 11 L89 22 Z" fill="#ffc23d" />
              <path
                d="M50 25 C30 25 17 37 17 52 C17 63 23 72 34 77 L30 89 L46 78 Q48 78.4 50 78.4 C70 78.4 83 66 83 51 C83 37 70 25 50 25 Z"
                fill="none"
                stroke="#f4f1e9"
                strokeWidth={5}
              />
              <path
                d="M35 52 L46 66 L70 38"
                fill="none"
                stroke="#1fe07a"
                strokeWidth={11}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div style={{ display: "flex", fontSize: 52, fontWeight: 900, letterSpacing: -1 }}>
              <span style={{ color: "#1fe07a" }}>v</span>
              <span>inko</span>
            </div>
          </div>
          {porra?.is_template && (
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 3,
                color: "#1fe07a",
                border: "3px solid #1fe07a",
                borderRadius: 999,
                padding: "8px 26px",
                textTransform: "uppercase",
                fontFamily: "monospace",
              }}
            >
              {t("p.badgeExample")}
            </div>
          )}
        </div>

        {/* pregunta 900 */}
        <div
          style={{
            display: "flex",
            fontSize: titleSize,
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            maxWidth: 1050,
          }}
        >
          {title}
        </div>

        {/* opciones verde/oro + pie mono */}
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {options.map((o, i) => (
              <div
                key={o.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  fontSize: 30,
                  fontWeight: 700,
                  background: "#141a1b",
                  border: `2px solid ${ACCENT[i]}`,
                  borderRadius: 16,
                  padding: "14px 28px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    border: `3px solid ${ACCENT[i]}`,
                    color: ACCENT[i],
                    fontSize: 22,
                    fontWeight: 900,
                    fontFamily: "monospace",
                  }}
                >
                  {["A", "B", "C", "D"][i]}
                </div>
                {o.label}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 2,
              color: "#8ba398",
              fontFamily: "monospace",
              textTransform: "uppercase",
            }}
          >
            {t("og.footer")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
