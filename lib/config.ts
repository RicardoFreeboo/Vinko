import { supabaseServer } from "@/lib/supabase/server";

// Remote config (L8): los parámetros de economía/ads/push viven en la tabla
// remote_config y se cambian sin desplegar. Estos defaults son el fallback si
// no hay backend (build local sin env).
export const CONFIG_DEFAULTS = {
  economy: {
    signup_pts: 1000,
    drip_amount: 100, drip_interval_h: 4, cap_pts: 7500,
    daily_bonus: [50, 75, 100, 150, 200, 300, 500],
    daily_pick_pts: 150, daily_pick_hit_pts: 300,
    ad_reward_pts: 200, ad_reward_daily_cap: 3,
  },
  ads: {
    enabled: true, programmatic_enabled: false,
    provider_waterfall: ["sponsor", "programmatic", "house"],
    rewarded_daily_offer_cap: 6, rewarded_daily_complete_cap: 4,
    interstitial_enabled: false, landing_ads_enabled: false,
  },
  push: { daily_cap: 2, weekly_cap: 8, non_personal_weekly_cap: 1 },
  misc: {
    league_size: 25, league_promote: 5, league_relegate: 5,
    season_tiers: 40, season_tier_xp: 1000,
  },
} as const;

export type ConfigKey = keyof typeof CONFIG_DEFAULTS;

export async function getConfig<K extends ConfigKey>(
  key: K,
): Promise<Record<string, unknown>> {
  const sb = await supabaseServer();
  if (!sb) return { ...CONFIG_DEFAULTS[key] } as Record<string, unknown>;
  const { data } = await sb.from("remote_config").select("value").eq("key", key).maybeSingle();
  return { ...CONFIG_DEFAULTS[key], ...(data?.value ?? {}) } as Record<string, unknown>;
}
