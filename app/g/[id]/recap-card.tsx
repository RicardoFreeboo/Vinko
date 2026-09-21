import { t } from "@/lib/i18n";

// El resumen de la semana (R-02): markup PURO para ImageResponse (satori):
// solo estilos inline, todo div con varios hijos lleva display:flex, sin
// emoji (satori los descarga de un CDN), sin Tailwind y sin hijos de texto
// mezclados. Lo usa la ruta /api/g/[id]/recap y la verificación estática.
// Dos formatos con medidas explícitas: "wa" 1200×630 (podio en fila +
// columna de tarjetas) y "story" 1080×1920 (podio en fila, tarjetas a lo
// ancho y pill con el código de invitación).

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

const INK = "#0c1011", INK2 = "#141a1b", INK3 = "#1d2627", CREAM = "#f4f1e9", WIN = "#1fe07a", GOLD = "#ffc23d", MUTED = "#8ba398";
const MEDAL = ["#ffc23d", "#c9d1cf", "#d99b1e"]; // oro, plata, bronce

// medidas por formato (px)
const F = {
  wa: {
    pad: 44, mark: 48, word: 38, badge: 17, name: 44, nameLong: 34, meta: 20,
    podBadge: 32, faceBig: 104, faceSm: 84, handleBig: 25, handleSm: 21, scoreBig: 22, scoreSm: 19, colW: 220, podGap: 8,
    cardLabel: 14, cardValue: 30, cardText: 21, cardPad: 16, cardsW: 440, footer: 19, code: 0, bestMax: 60,
  },
  story: {
    pad: 72, mark: 84, word: 64, badge: 26, name: 74, nameLong: 56, meta: 32,
    podBadge: 60, faceBig: 230, faceSm: 180, handleBig: 44, handleSm: 38, scoreBig: 38, scoreSm: 32, colW: 300, podGap: 14,
    cardLabel: 26, cardValue: 56, cardText: 38, cardPad: 30, cardsW: 936, footer: 30, code: 44, bestMax: 80,
  },
};

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
  const common = { width: size, height: size, borderRadius: 999, border: `${Math.max(3, Math.round(size * 0.06))}px solid ${color}` };
  if (p.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.avatar_url} alt="" style={{ ...common, objectFit: "cover" }} />;
  }
  return (
    <div style={{ ...common, display: "flex", alignItems: "center", justifyContent: "center",
      background: INK3, color: WIN, fontSize: Math.round(size * 0.38), fontWeight: 900 }}>
      {p.handle.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Podio({ p, week, f }: { p: RecapPodium; week: boolean; f: typeof F.wa }) {
  const place = Math.min(Math.max(p.rank, 1), 3);
  const color = MEDAL[place - 1];
  const big = place === 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: f.podGap,
      width: f.colW, paddingTop: big ? 0 : Math.round((f.faceBig - f.faceSm) / 2) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: f.podBadge, height: f.podBadge,
        borderRadius: 999, background: color, color: INK, fontSize: Math.round(f.podBadge * 0.55), fontWeight: 900, fontFamily: "monospace" }}>
        {String(place)}
      </div>
      <Face p={p} size={big ? f.faceBig : f.faceSm} color={color} />
      <div style={{ display: "flex", fontSize: big ? f.handleBig : f.handleSm, fontWeight: 900, color: CREAM }}>
        {`@${p.handle.slice(0, 16)}`}
      </div>
      <div style={{ display: "flex", fontSize: big ? f.scoreBig : f.scoreSm, fontWeight: 900, color: WIN, fontFamily: "monospace" }}>
        {`+${week ? p.skill_7d : p.skill_total} ${t("recap.skill")}`}
      </div>
    </div>
  );
}

function Card({ label, text, color, f }: { label: string; text: string; color: string; f: typeof F.wa }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: Math.round(f.cardPad * 0.35), background: INK2,
      border: `2px solid ${color}`, borderRadius: 18, padding: `${f.cardPad}px ${Math.round(f.cardPad * 1.4)}px` }}>
      <div style={{ display: "flex", fontFamily: "monospace", fontSize: f.cardLabel, color, letterSpacing: 2, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", fontSize: f.cardText, fontWeight: 900, lineHeight: 1.2 }}>{text}</div>
    </div>
  );
}

export function RecapCard({ data, format, code }: { data: RecapData | null; format: RecapFormat; code?: string | null }) {
  const { width, height } = RECAP_SIZES[format];
  const story = format === "story";
  const f = F[format];
  const bg = {
    width, height, display: "flex", flexDirection: "column" as const, justifyContent: "space-between",
    padding: f.pad, backgroundColor: INK, color: CREAM, fontFamily: "sans-serif",
    backgroundImage:
      "radial-gradient(60% 45% at 50% 0%, rgba(31,224,122,0.16), transparent 60%), radial-gradient(55% 45% at 95% 100%, rgba(255,194,61,0.13), transparent 60%)",
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: Math.round(f.mark * 0.25) }}>
        <Mark size={f.mark} />
        <div style={{ display: "flex", fontSize: f.word, fontWeight: 900, letterSpacing: -1 }}>
          <span style={{ color: WIN }}>v</span><span>inko</span>
        </div>
      </div>
      <div style={{ display: "flex", fontSize: f.badge, fontWeight: 700, letterSpacing: 3, color: WIN,
        border: `3px solid ${WIN}`, borderRadius: 999, padding: `${Math.round(f.badge * 0.45)}px ${Math.round(f.badge * 1.2)}px`,
        textTransform: "uppercase", fontFamily: "monospace" }}>
        {t("recap.title")}
      </div>
    </div>
  );

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "monospace",
      fontSize: f.footer, color: MUTED }}>
      <span>vinko.fun</span>
      <span>{t("recap.footer")}</span>
    </div>
  );

  if (!data) {
    return (
      <div style={bg}>
        {header}
        <div style={{ display: "flex", fontSize: f.name, fontWeight: 900, color: CREAM }}>{t("recap.na")}</div>
        {footer}
      </div>
    );
  }

  const week = data.podium.some((p) => p.skill_7d > 0);
  const podium = data.podium.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean) as RecapPodium[];
  const me = data.me;
  const best = me?.best
    ? { label: t("recap.myBest"), who: `@${me.handle}`, score: me.best.score, title: me.best.porra_title }
    : data.best
      ? { label: t("recap.best"), who: `@${data.best.handle}`, score: data.best.score, title: data.best.porra_title }
      : null;
  const bestLine = best
    ? `${best.who} · +${best.score} · «${best.title.slice(0, f.bestMax)}${best.title.length > f.bestMax ? "…" : ""}»`
    : "";
  const meLine = me ? `${t("recap.pos", { n: String(me.rank), total: String(data.members) })}  ·  +${week ? me.skill_7d : me.skill_total}` : "";

  const title = (
    <div style={{ display: "flex", flexDirection: "column", gap: Math.round(f.meta * 0.4) }}>
      <div style={{ display: "flex", fontSize: data.name.length > 24 ? f.nameLong : f.name, fontWeight: 900, letterSpacing: -1, lineHeight: 1.05 }}>
        {data.name}
      </div>
      <div style={{ display: "flex", gap: Math.round(f.meta * 0.8), fontFamily: "monospace", fontSize: f.meta, color: MUTED }}>
        <span>{t("recap.members", { n: String(data.members) })}</span>
        <span>·</span>
        <span style={{ color: data.streak > 0 ? GOLD : MUTED }}>{t("recap.streak", { n: String(data.streak) })}</span>
        <span>·</span>
        <span>{week ? t("recap.week") : t("recap.total")}</span>
      </div>
    </div>
  );

  const podiumRow = podium.length === 0 ? (
    <div style={{ display: "flex", fontSize: f.cardText, color: MUTED, alignItems: "center", width: f.colW * 3 }}>{t("recap.empty")}</div>
  ) : (
    <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "flex-start" }}>
      {order.map((p) => <Podio key={p.handle} p={p} week={week} f={f} />)}
    </div>
  );

  const cards = (
    <div style={{ display: "flex", flexDirection: "column", gap: Math.round(f.cardPad * 0.9), width: f.cardsW }}>
      {me && <Card label={t("recap.you")} text={meLine} color={GOLD} f={f} />}
      {best && <Card label={best.label} text={bestLine} color={WIN} f={f} />}
    </div>
  );

  if (!story) {
    return (
      <div style={bg}>
        {header}
        {title}
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {podiumRow}
          {cards}
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div style={bg}>
      {header}
      {title}
      {podiumRow}
      {cards}
      {code && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, borderRadius: 999,
          border: `3px solid ${GOLD}`, padding: "22px 36px", fontFamily: "monospace", fontSize: f.code, color: GOLD, fontWeight: 900 }}>
          <span>{t("recap.join", { code: code.toUpperCase() })}</span>
        </div>
      )}
      {footer}
    </div>
  );
}
