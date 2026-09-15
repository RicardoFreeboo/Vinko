"use client";
// Rewarded de Google para WEB: Ad Placement API (H5 Games Ads).
//
// Es el producto de Google para juegos HTML5 y SÍ sirve anuncios recompensados
// en web, usando la MISMA cuenta de AdSense. No aparece como "bloque de
// anuncio" en el panel porque no es un bloque: es una API de JavaScript.
//
// Requisito: la cuenta debe estar habilitada para H5 Games Ads. Mientras no lo
// esté, adBreak() responde sin anuncio y caemos al siguiente nivel de la
// cascada (patrocinador / vídeo propio). Nunca se castiga al usuario.
//
// Aquí SÍ es legítimo recompensar: el formato rewarded de Google está diseñado
// para eso. Lo prohibido es incentivar un anuncio display normal.
import { ADSENSE_CLIENT } from "@/lib/ads";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (o: any) => void;
    adConfig?: (o: any) => void;
  }
}

export type H5Result = "granted" | "dismissed" | "sin_anuncio" | "no_disponible";

let loading: Promise<boolean> | null = null;
// Si Google no responde (cuenta sin H5 habilitado), no volvemos a esperar en
// toda la sesión: se cae directo al patrocinador / vídeo propio.
let h5Muerto = false;

// Carga bajo demanda: nada de scripts de anuncios en /p/[slug].
function loadApi(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (typeof window.adBreak === "function") return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    s.async = true;
    s.crossOrigin = "anonymous";
    // data-ad-frequency-hint es lo que activa la API de colocación de anuncios
    s.setAttribute("data-ad-frequency-hint", "30s");
    s.onload = () => {
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        // adBreak y adConfig son la misma cola de adsbygoogle
        window.adBreak = window.adConfig = function (o: any) { (window.adsbygoogle as unknown[]).push(o); };
        window.adConfig({ sound: "on", preloadAdBreaks: "on" });
        resolve(true);
      } catch { resolve(false); }
    };
    s.onerror = () => resolve(false); // bloqueador de anuncios o red caída
    document.head.appendChild(s);
  });
  return loading;
}

export async function showH5Rewarded(timeoutMs = 2500): Promise<H5Result> {
  if (h5Muerto) return "no_disponible";
  const ok = await loadApi();
  if (!ok || typeof window.adBreak !== "function") return "no_disponible";

  return new Promise<H5Result>((resolve) => {
    let settled = false;
    let viewed = false;
    const finish = (r: H5Result) => { if (!settled) { settled = true; resolve(r); } };
    const guard = setTimeout(() => { h5Muerto = true; finish("sin_anuncio"); }, timeoutMs);

    try {
      window.adBreak!({
        type: "reward",
        name: "vinkos-reward",
        // Google avisa de que hay anuncio: se muestra llamando a showAdFn.
        beforeReward: (showAdFn: () => void) => { showAdFn(); },
        // Lo cerró antes de terminar: sin recompensa.
        adDismissed: () => { clearTimeout(guard); finish("dismissed"); },
        // Lo vio entero: recompensa ganada.
        adViewed: () => { viewed = true; },
        adBreakDone: (info: { breakStatus?: string }) => {
          clearTimeout(guard);
          if (viewed) return finish("granted");
          // viewed/dismissed ya resuelven; aquí caen los "no hubo anuncio"
          finish(info?.breakStatus === "viewed" ? "granted" : "sin_anuncio");
        },
      });
    } catch {
      clearTimeout(guard);
      finish("no_disponible");
    }
  });
}
