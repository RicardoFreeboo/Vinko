// ALPHA FREEZE — plantillas de porra (is_template=true, source=template).
// SIN picks y SIN profiles ficticios: solo título + opciones para probar el OG.
// Este mismo contenido vive en supabase/migrations/0004_seed_templates.sql;
// aquí sirve de fallback SSR mientras la base de datos no esté conectada.
// Copy SIEMPRE de lista blanca (nada de la lista negra del freeze).
import type { Porra } from "@/lib/porras";

const T = (
  slug: string,
  title: string,
  closes: string,
  labels: string[],
): Porra => ({
  id: `template-${slug}`,
  slug,
  title,
  is_template: true,
  source: "template",
  status: "open",
  closes_at: closes,
  winning_option_id: null,
  options: labels.map((label, idx) => ({
    id: `template-${slug}-${idx}`,
    idx,
    label,
  })),
});

export const TEMPLATES: Porra[] = [
  T("clasico-octubre", "¿Quién gana el Clásico de octubre?", "2026-10-25T20:00:00+02:00", ["Real Madrid", "Barça", "Empate"]),
  T("lluvia-boda-marta", "¿Llueve el sábado en la boda de Marta?", "2026-10-03T12:00:00+02:00", ["Cae la de dios", "Ni una gota"]),
  T("expulsion-jueves", "¿Se salva Raquel de la expulsión del jueves?", "2026-10-01T22:00:00+02:00", ["Se salva", "Expulsada"]),
  T("goles-espana-martes", "¿Cuántos goles marca España el martes?", "2026-10-13T20:45:00+02:00", ["0 o 1", "2 o 3", "4 o más"]),
  T("maraton-luis", "¿Baja Luis de las 4 horas en el maratón?", "2026-10-18T09:00:00+02:00", ["Sí, baja", "No llega"]),
  T("quien-paga-canas", "¿Quién paga las cañas este viernes?", "2026-10-02T21:00:00+02:00", ["Jorge", "Marta", "Rober", "Lucía"]),
  T("fichaje-antes-de", "¿Cuándo anuncia el equipo su próximo fichaje?", "2026-10-31T23:59:00+01:00", ["Esta semana", "Este mes", "Más tarde"]),
  T("carnet-chema", "¿Aprueba Chema el carnet a la primera?", "2026-10-07T13:00:00+02:00", ["A la primera", "Repite"]),
  T("velada-sabado", "¿Quién gana el combate principal del sábado?", "2026-10-10T23:00:00+02:00", ["El favorito", "La sorpresa"]),
  T("gasolina-fin-mes", "¿Baja la gasolina antes de fin de mes?", "2026-10-31T23:59:00+01:00", ["Baja", "Sigue igual o sube"]),
  T("cima-andres-bruno", "¿Quién llega antes a la cima, Andrés o Bruno?", "2026-10-11T14:00:00+02:00", ["Andrés", "Bruno"]),
  T("cancion-apertura", "¿Con qué canción abre el concierto del viernes?", "2026-10-09T22:00:00+02:00", ["Con la nueva", "Con el clásico", "Sorpresa"]),
];

export function templateBySlug(slug: string): Porra | null {
  return TEMPLATES.find((p) => p.slug === slug) ?? null;
}
