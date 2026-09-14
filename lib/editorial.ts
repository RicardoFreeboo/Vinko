// ============================================================================
// Vinko — capa editorial: el perfil OFICIAL de Vinko (@vinko) crea porras sobre
// los temas candentes de España (todos los ámbitos). PASO 5c del ALPHA FREEZE.
//
// Reglas que se respetan aquí:
//  · source=editorial → fuera de K-factor (métricas de negocio del §4).
//  · SIN picks ni perfiles ficticios: son solo pregunta + opciones (cero
//    participantes inventados; el bote arranca a 0 hasta que juegue gente real).
//  · Copy de lista blanca: "porra", nunca "apuesta/cuota/casa".
//  · Nada de cuotas/odds/casas de apuestas: preguntas resolubles por fuente
//    pública (deporte, TV, cripto, clima, cultura, actualidad).
//
// EDITORIAL = ya publicadas (se sirven en /p/[slug] con su OG y su vídeo IA).
// PROPOSALS = propuestas del scraper pendientes de que Ricardo apruebe en /admin/temas.
// ============================================================================
import type { Porra } from "@/lib/porras";

type Seed = {
  slug: string;
  title: string;
  closes: string;
  options: string[];
  cat: string;
};

// Vídeos IA: null hasta generarlos con Higgsfield (como en apk4) y dejarlos en
// /public/v/<slug>.webm. Mientras, /p muestra el placeholder "La IA está creando…".
const VIDEO: Record<string, string | null> = {};

function toPorra(s: Seed): Porra {
  return {
    id: `editorial-${s.slug}`,
    slug: s.slug,
    title: s.title,
    is_template: false,
    source: "editorial",
    official: true,
    status: "open",
    closes_at: s.closes,
    winning_option_id: null,
    video: VIDEO[s.slug] ?? null,
    options: s.options.map((label, idx) => ({ id: `editorial-${s.slug}-${idx}`, idx, label })),
  };
}

// --- Publicadas por @vinko (live en /p/[slug]) ---
const EDITORIAL_SEED: Seed[] = [
  { slug: "clasico-liga", cat: "Deporte", closes: "2026-09-27T21:00:00+02:00", title: "¿Quién gana el próximo Clásico de Liga?", options: ["Real Madrid", "Barça", "Empate"] },
  { slug: "alonso-podio", cat: "Deporte", closes: "2026-09-20T16:00:00+02:00", title: "¿Sube Fernando Alonso al podio este domingo?", options: ["Sí, podio", "Se queda fuera"] },
  { slug: "alcaraz-final", cat: "Deporte", closes: "2026-09-21T20:00:00+02:00", title: "¿Llega Alcaraz a la final del próximo torneo?", options: ["Llega a la final", "Cae antes"] },
  { slug: "btc-fin-de-mes", cat: "Cripto", closes: "2026-09-30T23:59:00+02:00", title: "¿Cierra Bitcoin el mes por encima de 100.000 $?", options: ["Por encima", "Por debajo"] },
  { slug: "smi-2027", cat: "Economía", closes: "2026-10-15T09:00:00+02:00", title: "¿Sube el Salario Mínimo en la próxima revisión?", options: ["Sube", "Se congela"] },
  { slug: "lluvia-madrid-finde", cat: "Clima", closes: "2026-09-19T09:00:00+02:00", title: "¿Llueve en Madrid este fin de semana?", options: ["Cae agua", "Ni una gota"] },
  { slug: "reality-favorito", cat: "TV", closes: "2026-10-02T23:00:00+02:00", title: "¿Gana el reality del momento el favorito del público?", options: ["El favorito", "La sorpresa"] },
  { slug: "cancion-verano-num1", cat: "Música", closes: "2026-09-22T12:00:00+02:00", title: "¿Aguanta la canción del momento otra semana en el nº1?", options: ["Sigue nº1", "La destronan"] },
];

export const EDITORIAL: Porra[] = EDITORIAL_SEED.map(toPorra);

export function editorialBySlug(slug: string): Porra | null {
  return EDITORIAL.find((p) => p.slug === slug) ?? null;
}

// --- Propuestas del scraper, pendientes de aprobar en /admin/temas ---
export type Proposal = {
  id: string;
  title: string;
  options: string[];
  source_url: string;
  cat: string;
  status: "pending_review";
};

export const PROPOSALS: Proposal[] = [
  { id: "prop-goya-pelicula", cat: "Cine", source_url: "Academia de Cine", status: "pending_review", title: "¿Gana una película española el próximo Goya a mejor película?", options: ["Sí", "No"] },
  { id: "prop-marquez-gp", cat: "Deporte", source_url: "Marca · MotoGP", status: "pending_review", title: "¿Gana Márquez el próximo Gran Premio de MotoGP?", options: ["Gana", "No gana"] },
  { id: "prop-elecciones-ano", cat: "Política", source_url: "RTVE", status: "pending_review", title: "¿Habrá elecciones generales antes de fin de año?", options: ["Sí", "No"] },
  { id: "prop-champions-semis", cat: "Deporte", source_url: "UEFA", status: "pending_review", title: "¿Llega algún equipo español a semifinales de Champions?", options: ["Sí, al menos uno", "Ninguno"] },
  { id: "prop-eth-5000", cat: "Cripto", source_url: "CoinMarketCap", status: "pending_review", title: "¿Supera Ethereum los 5.000 $ este trimestre?", options: ["Los supera", "No llega"] },
  { id: "prop-dana-levante", cat: "Clima", source_url: "AEMET", status: "pending_review", title: "¿Habrá aviso rojo por lluvias este otoño en el Levante?", options: ["Sí", "No"] },
  { id: "prop-serie-renueva", cat: "Streaming", source_url: "FormulaTV", status: "pending_review", title: "¿Renueva la serie española del momento por otra temporada?", options: ["Renueva", "Se cancela"] },
  { id: "prop-eurovision-top10", cat: "Música", source_url: "Eurovision-Spain", status: "pending_review", title: "¿Acaba España en el top 10 de Eurovisión?", options: ["Top 10", "Fuera del top 10"] },
];
