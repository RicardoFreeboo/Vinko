"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";
import { capture } from "@/lib/analytics";

// "Añadir a pantalla de inicio" (spec F-08): se enseña en la 2.ª sesión, nunca
// en la 1.ª. Android/Chrome → beforeinstallprompt (botón Instalar). iOS →
// explicación (Compartir → Añadir a pantalla de inicio). Descartable (30 días).
// Si no toca, no renderiza nada. Montaje: <A2HSPrompt /> en app/layout.tsx.

const SESSIONS_KEY = "vinko_sessions"; // contador de sesiones (localStorage)
const SESSION_FLAG = "vinko_sess";     // una sesión = una pestaña (sessionStorage)
const DISMISS_KEY = "vinko_a2hs";      // "installed" | timestamp del descarte
const SNOOZE_MS = 30 * 86400000;
// Fuera de las superficies virales/legales/admin: /p es la puerta de WhatsApp.
const SIN = ["/p/", "/admin", "/login", "/auth", "/bienvenida", "/secret", "/privacidad", "/terminos"];

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// El evento puede llegar antes de que React monte: se guarda a nivel de módulo.
let stashed: BIPEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); stashed = e as BIPEvent; });
}

function isStandalone(): boolean {
  try {
    return matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch { return false; }
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// Cuenta la sesión (una vez por pestaña) y devuelve el número de sesión.
function countSession(): number {
  try {
    const n = parseInt(localStorage.getItem(SESSIONS_KEY) ?? "0", 10) || 0;
    if (sessionStorage.getItem(SESSION_FLAG)) return n;
    sessionStorage.setItem(SESSION_FLAG, "1");
    localStorage.setItem(SESSIONS_KEY, String(n + 1));
    return n + 1;
  } catch { return 0; }
}

function snoozed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    if (v === "installed") return true;
    return Date.now() - Number(v) < SNOOZE_MS;
  } catch { return true; }
}

// `preview` (solo desarrollo, /bienvenida/preview): fuerza el modo para verlo
// sin esperar a la 2.ª sesión. En producción se ignora.
export function A2HSPrompt({ preview }: { preview?: "ios" | "android" } = {}) {
  const path = usePathname();
  const forced = process.env.NODE_ENV !== "production" ? preview : undefined;
  const [mode, setMode] = useState<"none" | "ios" | "android">(forced ?? "none");
  const [bip, setBip] = useState<BIPEvent | null>(null);

  useEffect(() => {
    if (forced) return;
    const session = countSession();
    if (session < 2 || snoozed() || isStandalone()) return; // nunca en la 1.ª sesión
    if (isIOS()) { setMode("ios"); return; }

    const arm = (e: BIPEvent) => { setBip(e); setMode("android"); };
    if (stashed) arm(stashed);
    const onBip = (e: Event) => { e.preventDefault(); arm(e as BIPEvent); };
    const onInstalled = () => {
      try { localStorage.setItem(DISMISS_KEY, "installed"); } catch { /* sin storage */ }
      capture("pwa_installed", { is_seed: false });
      setMode("none");
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [forced]);

  const hidden = !forced && (!path || SIN.some((p) => path.startsWith(p)));

  useEffect(() => {
    if (mode !== "none" && !hidden) capture("pwa_install_prompt_shown", { is_seed: false, platform: mode });
  }, [mode, hidden]);

  if (mode === "none" || hidden) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sin storage */ }
    setMode("none");
  }

  async function install() {
    if (!bip) { dismiss(); return; }
    try {
      await bip.prompt();
      const { outcome } = await bip.userChoice;
      if (outcome === "accepted") {
        try { localStorage.setItem(DISMISS_KEY, "installed"); } catch { /* sin storage */ }
        setMode("none");
        return;
      }
    } catch { /* el navegador puede negarse: se descarta igual */ }
    dismiss();
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-[430px] p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <section role="dialog" aria-labelledby="a2hs-title"
        className="pointer-events-auto rounded-[18px] border border-[var(--line)] bg-[var(--ink2)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[var(--ink3)] text-xl" aria-hidden>📲</span>
          <div className="min-w-0 flex-1">
            <p id="a2hs-title" className="text-[15px] font-black text-[var(--cream)]">{t("a2hs.title")}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--muted)]">{t("a2hs.body")}</p>
            {mode === "ios" && (
              <p className="mt-2 rounded-[10px] bg-[var(--ink3)] px-3 py-2 text-[13px] font-bold leading-snug text-[var(--cream)]">{t("a2hs.ios")}</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {mode === "android" ? (
            <>
              <button type="button" onClick={dismiss} className="flex-1 rounded-[12px] border border-[var(--line)] px-3 py-2.5 text-sm font-bold text-[var(--muted)]">{t("a2hs.later")}</button>
              <button type="button" onClick={install} className="flex-1 rounded-[12px] bg-[var(--win)] px-3 py-2.5 text-sm font-black text-[var(--ink)]">{t("a2hs.install")}</button>
            </>
          ) : (
            <button type="button" onClick={dismiss} className="flex-1 rounded-[12px] bg-[var(--win)] px-3 py-2.5 text-sm font-black text-[var(--ink)]">{t("a2hs.ok")}</button>
          )}
        </div>
      </section>
    </div>
  );
}
