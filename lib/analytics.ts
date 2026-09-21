"use client";
// Analítica (taxonomía §6.1 del spec + regla del freeze: TODO capture() lleva
// is_seed). Sin NEXT_PUBLIC_POSTHOG_KEY es un no-op silencioso — jamás rompe
// la UI. Envío por HTTP (sin dependencia).

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

export type EventName =
  // gamificación
  | "daily_pick_shown" | "daily_pick_submitted" | "daily_pick_resolved"
  | "streak_extended" | "streak_broken" | "streak_shield_used" | "streak_recovered"
  | "quest_completed" | "season_tier_unlocked"
  | "league_week_started" | "league_promoted" | "league_relegated"
  | "boost_purchased" | "boost_used"
  | "group_digest_generated" | "group_digest_shared"
  // loop
  | "sign_up" | "login"
  | "porra_created" | "pick_made" | "porra_resolved" | "porra_shared"
  // publicidad
  | "ad_opportunity_shown" | "ad_opt_in" | "ad_started" | "ad_completed"
  | "ad_failed" | "ad_reward_granted"
  // notificaciones
  | "push_prompt_shown" | "push_permission_granted" | "push_permission_denied"
  | "pwa_install_prompt_shown" | "pwa_installed"
  | "push_opened" | "push_class_muted" | "push_permission_revoked"
  | "inbox_opened" | "inbox_item_clicked";

function distinctId(): string {
  try {
    let id = localStorage.getItem("vinko_did");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("vinko_did", id); }
    return id;
  } catch { return "anon"; }
}

// Subconjunto que también va a Google Analytics (adquisición/tráfico). PostHog
// sigue siendo la analítica de producto: no se duplica todo a ciegas.
const GA_MIRROR = new Set<string>([
  "sign_up", "login",
  "porra_created", "pick_made", "porra_resolved", "porra_shared",
  "daily_pick_submitted", "daily_pick_resolved",
  "streak_extended", "streak_broken", "ad_reward_granted",
  "push_permission_granted", "league_promoted",
]);

// is_seed OBLIGATORIO (regla de datos del freeze): usuarios reales = false.
export function capture(
  event: EventName,
  props: { is_seed: boolean } & Record<string, unknown>,
): void {
  // Espejo a GA (sin datos personales: solo el nombre del evento e is_seed).
  if (GA_MIRROR.has(event)) {
    try {
      (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.(
        "event", event, { is_seed: props.is_seed },
      );
    } catch { /* la analítica jamás rompe la UI */ }
  }
  if (!KEY) return;
  try {
    const body = JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: distinctId(),
      properties: { ...props, $lib: "vinko-web" },
      timestamp: new Date().toISOString(),
    });
    navigator.sendBeacon?.(`${HOST}/i/v0/e/`, body) ??
      fetch(`${HOST}/i/v0/e/`, { method: "POST", body, keepalive: true });
  } catch { /* la analítica jamás rompe la UI */ }
}
