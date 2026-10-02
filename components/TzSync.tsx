"use client";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { syncTz } from "@/lib/tz";

// FX-03: al entrar al feed con sesión, guarda la zona horaria del dispositivo
// (si cambió). No pinta nada; corre una vez por carga.
export function TzSync() {
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    void (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (user && !user.is_anonymous) await syncTz(sb);
    })();
  }, []);
  return null;
}
