"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

// FX-03: zona horaria del dispositivo → profiles.tz (RPC set_tz, validada en
// servidor). Se sincroniza en silencio: una vez por zona (localStorage) y sin
// bloquear nunca la UI. Si la migración 0058 no está aplicada (PGRST202), no
// pasa nada: se reintenta en la próxima visita.
const KEY = "vinko_tz";

export function deviceTz(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export async function syncTz(sb: SupabaseClient): Promise<void> {
  const tz = deviceTz();
  if (!tz) return;
  try {
    if (localStorage.getItem(KEY) === tz) return;
  } catch { /* sin storage: se intenta igual */ }
  const { error } = await sb.rpc("set_tz", { p_tz: tz });
  if (!error) {
    try { localStorage.setItem(KEY, tz); } catch { /* da igual */ }
  }
}
