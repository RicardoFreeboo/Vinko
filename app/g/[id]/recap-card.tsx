import { t } from "@/lib/i18n";

// El resumen de la semana (R-02): markup PURO para ImageResponse (satori):
// solo estilos inline, todo div con varios hijos lleva display:flex, sin
// emoji (satori los descarga de un CDN) y sin Tailwind. Lo usa la ruta
// /api/g/[id]/recap y la verificación estática con datos de prueba.

export type RecapPodium = {
  handle: string; avatar_url: string | null; skill_7d: number; skill_total: number; rank: number;
};
export type RecapData = {
  id: string;
  name: string;
  members: number;
  streak: number;
  cutoff: string;
  podium: RecapPodium[];
  me: {
    handle: string; rank: number; skill_7d: number; skill_total: number;
    best: { score: number; porra_title: string } | null;
  } | null;
  best: { handle: string; score: number; porra_title: string } | null;
};
export type RecapFormat = "wa" | "story";
export const RECAP_SIZES: Record<RecapFormat, { width: number; height: number }> = {
  wa: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
};

const INK = "#0c1011", INK2 = "#141a1b", CREAM = "#f4f1e9", WIN = "#1fe07a", GOLD = "#ffc23d", MUTED = "#8ba398";
const MEDAL = ["#ffc23d", "#c9d1cf", "#d99b1e"]; // oro, plata, bronce

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <path d="M55 22 L59 11 L66 17 L72 8 L78 17 L85 11 L89 22 Z" fill={GOLD} />
      <path d="M50 25 C30 25 17 37 17 52 C17 63 23 72 34 77 L30 89 L46 78 Q48 78.4 50 78.4 C70 78.4 83 66 83 51 C83 37 70 25 50 25 Z"
        fill="none" stroke={CREAM} strokeWidth={5} />
      <path d="M35 52 L46 66 L70 38" fill="none" stroke={WIN} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Face({ p, size, color }: { p: RecapPodium; size: number; color: string }) {
  const common = { width: size, height: size, borderRadius: 999, border: `${Math.round(size * 0.07)}px solid ${color}` };
  if (p.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.avatar_url} alt="" style={{ ...common, objectFit: "cover" }} />;
  }
  return (
    <div style={{ ...common, display: "flex", alignItems: "center", justifyContent: "center",
      background: "#1d2627", color: WIN, fontSize: Math.round(size * 0.38), fontWeight: 900 }}>
      {p.handle.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Podio({ p, place, week, scale }: { p: RecapPodium; place: number; week: boolean; scale: number }) {
  const color = MEDAL[place - 1];
  const big = place === 1;
  const face = Math.round((big ? 150 : 116) * scale);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(12 * scale),
      width: Math.round(300 * scale), paddingTop: big ? 0 : Math.round(30 * scale) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: Math.round(44 * scale), height: Math.round(44 * scale),
        borderRadius: 999, background: color, color: INK, fontSize: Math.round(24 * scale), fontWeight: 900, fontFamily: "monospace" }}>
        {place}
      </div>
      <Face p={p} size={face} color={color} />
      <div style={{ display: "flex", fontSize: Math.round((big ? 34 : 28) * scale), fontWeight: 900, color: CREAM, maxWidth: Math.round(300 * scale) }}>
        @{p.handle.slice(0, 16)}
      </div>
      <div style={{ display: "flex", fontSize: Math.round((big ? 30 : 24) * scale), fontWeight: 900, color: WIN, fontFamily: "monospace" }}>
        +{week ? p.skill_7d : p.skill_total} {t("recap.skill")}
      </div>
    </div>
  );
}

export function RecapCard({ data, format }: { data: RecapData | null; format: RecapFormat }) {
  const { width, height } = RECAP_SIZES[format];
  const story = format === "story";
  const s = story ? 1.35 : 1; // escala tipográfica del formato vertical
  const pad = story ? 72 : 56;
  const bg = {
    width, height, display: "flex", flexDirection: "column" as const, justifyContent: "space-between",
    padding: pad, backgroundColor: INK, color: CREAM, fontFamily: "sans-serif",
    backgroundImage:
      "radial-gradient(60% 45% at 50% 0%, rgba(31,224,122,0.16), transparent 60%), radial-gradient(55% 45% at 95% 100%, rgba(255,194,61,0.13), transparent 60%)",
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Mark size={Math.round(56 * s)} />
        <div style={{ display: "flex", fontSize: Math.round(44 * s), fontWeight: 900, letterSpacing: -1 }}>
          <span style={{ color: WIN }}>v</span><span>inko</span>
        </div>
      </div>
      <div style={{ display: "flex", fontSize: Math.round(20 * s), fontWeight: 700, letterSpacing: 3, color: WIN,
        border: `3px solid ${WIN}`, borderRadius: 999, padding: `${Math.round(8 * s)}px ${Math.round(22 * s)}px`,
        textTransform: "uppercase", fontFamily: "monospace" }}>
        {t("recap.title")}
      </div>
    </div>
  );

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "monospace",
      fontSize: Math.round(22 * s), color: MUTED }}>
      <span>vinko.fun</span>
      <span>{t("recap.footer")}</span>
    </div>
  );

  if (!data) {
    return (
      <div style={bg}>
        {header}
        <div style={{ display: "flex", fontSize: Math.round(54 * s), fontWeight: 900, color: CREAM }}>{t("recap.na")}</div>
        {footer}
      </div>
    );
  }

  const week = data.podium.some((p) => p.skill_7d > 0);
  const podium = data.podium.slice(0, 3);
  const order = story ? podium : [podium[1], podium[0], podium[2]].filter(Boolean);
  const me = data.me;
  const best = me?.best ? { label: t("recap.myBest"), who: `@${me.handle}`, ...me.best } : data.best
    ? { label: t("recap.best"), who: `@${data.best.handle}`, score: data.best.score, porra_title: data.best.porra_title }
    : null;

  const nameSize = data.name.length > 24 ? 40 : 52;

  return (
    <div style={bg}>
      {header}

      {/* nombre del grupo + racha */}
      <div style={{ display: "flex", flexDirection: "column", gap: Math.round(10 * s) }}>
        <div style={{ display: "flex", fontSize: Math.round(nameSize * s), fontWeight: 900, letterSpacing: -1, lineHeight: 1.05 }}>
          {data.name}
        </div>
        <div style={{ display: "flex", gap: Math.round(18 * s), fontFamily: "monospace", fontSize: Math.round(22 * s), color: MUTED }}>
          <span>{t("recap.members", { n: String(data.members) })}</span>
          <span>·</span>
          <span style={{ color: data.streak > 0 ? GOLD : MUTED }}>{t("recap.streak", { n: String(data.streak) })}</span>
          <span>·</span>
          <span>{week ? t("recap.week") : t("recap.total")}</span>
        </div>
      </div>

      {/* podio */}
      {podium.length === 0 ? (
        <div style={{ display: "flex", fontSize: Math.round(32 * s), color: MUTED }}>{t("recap.empty")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: story ? "column" : "row", justifyContent: "center",
          alignItems: story ? "center" : "flex-start", gap: story ? 40 : 0 }}>
          {order.map((p) => (
            <Podio key={p.handle} p={p} place={p.rank} week={week} scale={s} />
          ))}
        </div>
      )}

      {/* tu posición + mejor acierto */}
      <div style={{ display: "flex", flexDirection: story ? "column" : "row", gap: Math.round(18 * s) }}>
        {me && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, background: INK2,
            border: `2px solid ${GOLD}`, borderRadius: 18, padding: `${Math.round(16 * s)}px ${Math.round(22 * s)}px` }}>
            <div style={{ display: "flex", fontFamily: "monospace", fontSize: Math.round(18 * s), color: GOLD, letterSpacing: 2, textTransform: "uppercase" }}>
              {t("recap.you")}
            </div>
            <div style={{ display: "flex", fontSize: Math.round(34 * s), fontWeight: 900 }}>
              {t("recap.pos", { n: String(me.rank), total: String(data.members) })}
              <span style={{ color: WIN, marginLeft: 14, fontFamily: "monospace" }}>+{week ? me.skill_7d : me.skill_total}</span>
            </div>
          </div>
        )}
        {best && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1.4, background: INK2,
            border: `2px solid ${WIN}`, borderRadius: 18, padding: `${Math.round(16 * s)}px ${Math.round(22 * s)}px` }}>
            <div style={{ display: "flex", fontFamily: "monospace", fontSize: Math.round(18 * s), color: WIN, letterSpacing: 2, textTransform: "uppercase" }}>
              {best.label}
            </div>
            <div style={{ display: "flex", fontSize: Math.round(26 * s), fontWeight: 900, lineHeight: 1.15 }}>
              {best.who} · +{best.score} · «{best.porra_title.slice(0, story ? 70 : 48)}{best.porra_title.length > (story ? 70 : 48) ? "…" : ""}»
            </div>
          </div>
        )}
      </div>

      {footer}
    </div>
  );
}
