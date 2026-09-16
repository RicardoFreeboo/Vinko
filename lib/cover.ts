// Portada temática para porras SIN vídeo. Sustituye al antiguo "La IA está
// creando el vídeo", que prometía algo que no ocurría: los vídeos se generan a
// mano (gastan créditos), así que la mayoría de porras nunca lo tenían.
// Detecta la temática por categoría + título porque las categorías del agente
// llegan sin normalizar ("reality_tv", "Reality TV", "realitys"…).
export type CoverTheme = { key: string; emoji: string; from: string; glow: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const TEMAS: Array<[RegExp, CoverTheme]> = [
  // Streamers antes que realities: category "reality_internet" es drama de streamers
  [/streamer|internet|influencer|ibai|velada|frank cuesta|twitch|\bkick\b|youtube|rubius|auronplay|grefg|illojuan|westcol|spreen|davoo/,
    { key: "streaming", emoji: "🎮", from: "#21163f", glow: "rgba(145,110,255,0.35)" }],
  [/realit|isla de las tentaciones|supervivientes|gran hermano|\bgh\b|masterchef|operacion triunfo|\bot\b|casados a primera|carcel de los gemelos|maestros de la costura|bailando/,
    { key: "reality", emoji: "🏝️", from: "#3b1440", glow: "rgba(255,95,162,0.35)" }],
  [/\bf1\b|formula 1|alonso|sainz|gran premio|\bgp\b|motogp|marquez|madring/,
    { key: "motor", emoji: "🏎️", from: "#3d1111", glow: "rgba(255,90,70,0.35)" }],
  [/tenis|alcaraz|nadal|us open|roland garros|wimbledon|\batp\b|shelton/,
    { key: "tenis", emoji: "🎾", from: "#2e3a0d", glow: "rgba(200,255,80,0.30)" }],
  [/futbol|laliga|la liga|champions|mundial|seleccion|real madrid|barca|barcelona|atletico|\bgol|kings league|queens league|jornada|clasico|rayo|espanyol|balon de oro/,
    { key: "futbol", emoji: "⚽", from: "#0f3a24", glow: "rgba(31,224,122,0.32)" }],
  [/musica|cancion|disco|eurovision|benidorm|concierto|rosalia|aitana|quevedo|numero 1|n\.?º ?1/,
    { key: "musica", emoji: "🎵", from: "#3a2a0a", glow: "rgba(255,209,102,0.32)" }],
  [/cine|pelicula|goya|serie|television|audiencia|\btv\b|revuelta|arguinano|programa/,
    { key: "tele", emoji: "🎬", from: "#102b3b", glow: "rgba(80,180,255,0.30)" }],
  [/llueve|lluvia|temperatura|calor|aemet|tiempo en/,
    { key: "tiempo", emoji: "🌦️", from: "#0e2b3a", glow: "rgba(120,200,255,0.30)" }],
  [/bitcoin|\bbtc\b|ibex|bolsa|euro|salario|\bsmi\b|cripto/,
    { key: "economia", emoji: "📈", from: "#243a10", glow: "rgba(170,230,90,0.30)" }],
];

const OTROS: CoverTheme = { key: "actualidad", emoji: "🔮", from: "#1a2621", glow: "rgba(31,224,122,0.22)" };

export function coverTheme(category: string | null | undefined, title: string): CoverTheme {
  const txt = norm(`${category ?? ""} ${title}`);
  for (const [re, theme] of TEMAS) if (re.test(txt)) return theme;
  return OTROS;
}
