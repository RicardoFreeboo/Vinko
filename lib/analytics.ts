// ============================================================================
// Vinko alfa — helper único de PostHog (EU).
// ALPHA FREEZE: todo capture() lleva `is_seed: boolean` OBLIGATORIO — por tipo
// y en runtime. Este helper NO define ni renombra la taxonomía de eventos
// (los 18 llegan por parámetro desde el código que los dispara). El cubo
// FUTURO (feed vídeo, follow, redeem, affiliate, capa2) está OFF: no dispararlo.
// GDPR: sin autocapture, sin pageviews automáticos, persistencia en memoria
// (cero cookies) hasta que exista la base legal prevista.
// ============================================================================
import posthog from 'posthog-js'

let started = false

export function initAnalytics(): void {
  if (started || typeof window === 'undefined') return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return // sin clave no hay analítica; la app jamás se rompe por esto
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com', // EU SIEMPRE
    capture_pageview: false,
    autocapture: false,
    persistence: 'memory',
  })
  started = true
}

type Props = Record<string, unknown>

/**
 * Único punto de captura permitido en el repo.
 * `isSeed` es obligatorio: true para plantillas/editorial/pruebas, false SOLO
 * para actividad de usuarios reales. Los dashboards de tracción filtran
 * is_seed=false; si hay duda, true (o no instrumentar).
 */
export function capture(event: string, isSeed: boolean, props: Props = {}): void {
  if (!started) return
  if (typeof isSeed !== 'boolean') return // sin is_seed no se dispara
  posthog.capture(event, { ...props, is_seed: isSeed })
}

export function identify(userId: string, props: Props = {}): void {
  if (!started) return
  posthog.identify(userId, props)
}
