import { ImageResponse } from "next/og";
import { getPorraBySlug } from "@/lib/porras";
import { t } from "@/lib/i18n";

// Miniatura de WhatsApp: título + opciones + Vinko. 1200×630.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Vinko";

type Props = { params: Promise<{ slug: string }> };

export default async function OgImage({ params }: Props) {
  const { slug } = await params;
  const porra = await getPorraBySlug(slug);
  const title =
    porra && porra.status !== "taken_down" ? porra.title : t("p.notAvailable");
  const options =
    porra && porra.status !== "taken_down" ? porra.options.slice(0, 4) : [];
  const titleSize = title.length > 60 ? 52 : title.length > 40 ? 62 : 74;

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
          background: "linear-gradient(135deg, #0b0b12 0%, #1c1240 55%, #0b0b12 100%)",
          color: "#f0eef6",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 800, color: "#9678ff" }}>
            {t("brand")}
          </div>
          {porra?.is_template && (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 700,
                color: "#00e0b8",
                border: "3px solid #00e0b8",
                borderRadius: 999,
                padding: "8px 28px",
              }}
            >
              {t("p.badgeExample")}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: titleSize,
            fontWeight: 800,
            lineHeight: 1.15,
            maxWidth: 1050,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {options.map((o) => (
              <div
                key={o.id}
                style={{
                  display: "flex",
                  fontSize: 30,
                  fontWeight: 600,
                  background: "rgba(240,238,246,0.10)",
                  border: "2px solid rgba(240,238,246,0.25)",
                  borderRadius: 16,
                  padding: "14px 30px",
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#a09db4" }}>
            {t("og.footer")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
