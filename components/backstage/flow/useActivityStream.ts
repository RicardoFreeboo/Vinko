"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Activity } from "@/lib/backstage/graph";

// Alimenta el grafo con eventos REALES. MVP: polling de recent_activity cada 4s
// (robusto, cero websockets). Solo emite lo NUEVO desde la última vez (por ts),
// para reproducirlo como haces. Devuelve también el ritmo (eventos/min).
export function useActivityStream(): {
  pending: Activity[]; clearPending: () => void; rate: number; ready: boolean; reducedMotion: boolean;
} {
  const [pending, setPending] = useState<Activity[]>([]);
  const [rate, setRate] = useState(0);
  const [ready, setReady] = useState(false);
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const lastTs = useRef<string>("");
  const window60 = useRef<number[]>([]);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) { setReady(true); return; }
    let alive = true;

    async function tick() {
      if (document.hidden) return; // no quemar en pestaña oculta
      const { data } = await sb!.rpc("recent_activity", { p_limit: 40 });
      if (!alive) return;
      setReady(true);
      const rows = (data ?? []) as Activity[];
      if (!lastTs.current) {
        // primera carga: no disparamos 40 haces de golpe, solo fijamos el cursor
        lastTs.current = rows[0]?.ts ?? new Date().toISOString();
        return;
      }
      const fresh = rows.filter((r) => r.ts > lastTs.current).reverse();
      if (fresh.length) {
        lastTs.current = fresh[fresh.length - 1].ts;
        const now = Date.now();
        fresh.forEach(() => window60.current.push(now));
        if (!reducedMotion) setPending((p) => [...p, ...fresh].slice(-60));
      }
      window60.current = window60.current.filter((t) => Date.now() - t < 60000);
      setRate(window60.current.length);
    }

    tick();
    const id = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [reducedMotion]);

  return { pending, clearPending: () => setPending([]), rate, ready, reducedMotion: !!reducedMotion };
}
