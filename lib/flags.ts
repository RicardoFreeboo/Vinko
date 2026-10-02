import type { SupabaseClient } from "@supabase/supabase-js";

// MON-01 — flag único de servidor para la UI de dinero. FAIL-CLOSED: sin
// backend, sin fila o con error, el dinero está APAGADO. Solo
// remote_config.money_ui = {"enabled": true} lo enciende (y /demo y /showcase
// exigen además is_admin).
export async function moneyUiEnabled(sb: SupabaseClient | null): Promise<boolean> {
  if (!sb) return false;
  try {
    const { data } = await sb.from("remote_config").select("value").eq("key", "money_ui").maybeSingle();
    return (data?.value as { enabled?: boolean } | null)?.enabled === true;
  } catch {
    return false;
  }
}
