"use client";
// Rewarded REAL de Google Ad Manager (GPT rewarded web).
//
// Por qué aquí y no AdSense: AdSense no sirve rewarded y además prohíbe
// incentivar la visualización de sus anuncios (riesgo de suspensión). El
// rewarded monetizado sólo es legal vía Ad Manager (web) o AdMob (app).
//
// Sin NEXT_PUBLIC_GAM_REWARDED_UNIT configurada, showRewarded() devuelve
// "sin_unidad" al instante y el llamador cae a la house ad. En cuanto exista
// la unidad, esto pasa a servir el anuncio real sin tocar nada más.
import { GAM_REWARDED_UNIT } from "@/lib/ads";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { googletag?: any }
}

export type RewardedResult = "granted" | "sin_unidad" | "sin_relleno" | "cerrado" | "error";

let gptLoading: Promise<boolean> | null = null;

// El script se carga BAJO DEMANDA (nunca en el layout) para no meter scripts de
// anuncios en /p/[slug], donde la regla es cero anuncios.
function loadGpt(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.googletag?.apiReady) return Promise.resolve(true);
  if (gptLoading) return gptLoading;
  gptLoading = new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false); // bloqueador de anuncios o red caída
    document.head.appendChild(s);
  });
  return gptLoading;
}

export async function showRewarded(timeoutMs = 12000): Promise<RewardedResult> {
  if (!GAM_REWARDED_UNIT) return "sin_unidad";
  const ok = await loadGpt();
  if (!ok) return "error";

  return new Promise<RewardedResult>((resolve) => {
    const googletag = window.googletag;
    if (!googletag) { resolve("error"); return; }
    googletag.cmd = googletag.cmd || [];

    let done = false;
    let granted = false;
    let slot: any = null;

    const finish = (r: RewardedResult) => {
      if (done) return;
      done = true;
      try { if (slot) googletag.destroySlots([slot]); } catch { /* noop */ }
      resolve(r);
    };
    const guard = setTimeout(() => finish("sin_relleno"), timeoutMs);

    googletag.cmd.push(() => {
      try {
        const fmt = googletag.enums?.OutOfPageFormat?.REWARDED;
        slot = fmt ? googletag.defineOutOfPageSlot(GAM_REWARDED_UNIT, fmt) : null;
        if (!slot) { clearTimeout(guard); finish("sin_relleno"); return; }
        slot.addService(googletag.pubads());

        const pubads = googletag.pubads();
        // Listo para mostrarse → se enseña a pantalla completa.
        pubads.addEventListener("rewardedSlotReady", (e: any) => {
          try { e.makeRewardedVisible(); } catch { finish("error"); }
        });
        // El usuario completó el anuncio: AQUÍ se ha ganado la recompensa.
        pubads.addEventListener("rewardedSlotGranted", () => { granted = true; });
        // Cerró (con o sin recompensa).
        pubads.addEventListener("rewardedSlotClosed", () => {
          clearTimeout(guard);
          finish(granted ? "granted" : "cerrado");
        });
        // Sin inventario: no se castiga al usuario, se cae a la house ad.
        pubads.addEventListener("slotRenderEnded", (e: any) => {
          if (e.slot === slot && e.isEmpty) { clearTimeout(guard); finish("sin_relleno"); }
        });

        googletag.enableServices();
        googletag.display(slot);
      } catch {
        clearTimeout(guard);
        finish("error");
      }
    });
  });
}
