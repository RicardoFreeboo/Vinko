import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Config del Vinko Club (VINKO_BILLING_SPEC A). Precio en remote_config.club.
export type ClubConfig = {
  enabled: boolean;
  monthly_minor: number;
  annual_minor: number;
  currency: string;
  trial_days: number;
  invoicing_entity: string | null;
  perks: string[];
};

const DEFAULTS: ClubConfig = {
  enabled: true, monthly_minor: 399, annual_minor: 3499, currency: "EUR",
  trial_days: 0, invoicing_entity: null, perks: ["no_ads", "cosmetics", "stats", "more_groups", "focus_monthly"],
};

export async function getClubConfig(sb: SupabaseClient | null): Promise<ClubConfig> {
  if (!sb) return { ...DEFAULTS };
  try {
    const { data } = await sb.from("remote_config").select("value").eq("key", "club").maybeSingle();
    return { ...DEFAULTS, ...((data?.value ?? {}) as Partial<ClubConfig>) };
  } catch { return { ...DEFAULTS }; }
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
