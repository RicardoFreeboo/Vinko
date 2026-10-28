"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Download, Share, Smartphone } from "lucide-react";
import { BottomSheet, SheetGhost, SheetPrimary, claimSheet, releaseSheet } from "@/components/BottomSheet";
import { readConsent } from "@/components/ConsentBanner";
import { VMark } from "@/components/Logo";
import { t } from "@/lib/i18n";
import { capture } from "@/lib/analytics";

// «Ten Vinko a un toque» (VINKO_PANTALLAS 15, spec F-08): hoja inferior desde
// la 2.ª sesión, nunca en la 1.ª, y solo en el móvil (en escritorio no hay
// «pantalla de inicio»; allí ya lo dice el carril derecho de DesktopShell).
// Android/Chrome → beforeinstallprompt (botón Instalar). iOS → explicación
// (Compartir → Añadir a pantalla de inicio). «Ahora no» la calla 30 días.
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
// Descartada en esta carga de página: aunque el storage falle, no vuelve.
let dismissedNow = false;
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

function isMobile(): boolean {
  return isIOS() || /android|mobile/i.test(navigator.userAgent);
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

// Descartada con CUALQUIER marca: "installed", un timestamp de < 30 días o un
// valor antiguo no numérico (el viejo InstallHint escribía "no" en esta misma
// clave; Number("no") es NaN y la hoja volvía a salir en todas las pantallas).
function snoozed(): boolean {
  if (dismissedNow) return true;
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const at = Number(v);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at < SNOOZE_MS;
  } catch { return true; }
}

function remember(v: string): void {
  dismissedNow = true;
  try { localStorage.setItem(DISMISS_KEY, v); } catch { /* sin storage: vale dismissedNow */ }
}

// `preview` (solo desarrollo, /bienvenida/preview): fuerza el modo para verlo
// sin esperar a la 2.ª sesión. En producción se ignora.
export function A2HSPrompt({ preview }: { preview?: "ios" | "android" } = {}) {
  const path = usePathname();
  const forced = process.env.NODE_ENV !== "production" ? preview : undefined;
  const [mode, setMode] = useState<"none" | "ios" | "android">(forced ?? "none");
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (forced) return;
    const session = countSession();
    if (session < 2 || snoozed() || isStandalone() || !isMobile()) return; // nunca en la 1.ª sesión
    if (readConsent() === null) return; // primero el aviso de cookies: un aviso cada vez
    if (isIOS()) { setMode("ios"); return; }

    // Chrome puede volver a lanzar beforeinstallprompt: cada evento vuelve a
    // mirar el descarte (antes la hoja reaparecía después de «Ahora no»).
    const arm = (e: BIPEvent) => { if (snoozed()) return; setBip(e); setMode("android"); };
    if (stashed) arm(stashed);
    const onBip = (e: Event) => { e.preventDefault(); arm(e as BIPEvent); };
    const onInstalled = () => {
      remember("installed");
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
  const wanted = mode !== "none" && !hidden;

  // La hoja se pide solo cuando de verdad se ve: en /p no se retiene (allí
  // manda el aviso de notificaciones tras votar) y nunca se apila con otra.
  useEffect(() => {
    if (!wanted || !claimSheet("a2hs")) return;
    setClaimed(true);
    capture("pwa_install_prompt_shown", { is_seed: false, platform: mode });
    return () => { releaseSheet("a2hs"); setClaimed(false); };
  }, [wanted, mode]);

  const dismiss = useCallback(() => {
    remember(String(Date.now()));
    setMode("none");
  }, []);

  if (!wanted || !claimed) return null;

  async function install() {
    if (!bip) { dismiss(); return; }
    try {
      await bip.prompt();
      const { outcome } = await bip.userChoice;
      if (outcome === "accepted") {
        remember("installed");
        setMode("none");
        return;
      }
    } catch { /* el navegador puede negarse: se descarta igual */ }
    dismiss();
  }

  return (
    <BottomSheet labelledBy="a2hs-title" onClose={dismiss}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-[16px] border border-[var(--line2)] bg-[var(--ink)]">
          <VMark size={40} />
        </span>
        <div className="min-w-0">
          <h2 id="a2hs-title" className="text-[23px] font-black leading-[1.1] tracking-[-0.03em] text-[var(--cream)]">{t("a2hs.title")}</h2>
          <p className="mt-1 text-[14.5px] leading-snug text-[var(--muted)]">{t("a2hs.body")}</p>
        </div>
      </div>
      <ul className="mt-[18px] flex flex-col gap-2.5 text-[15px] text-[var(--cream)]">
        <li className="flex items-center gap-2.5"><Bell size={19} aria-hidden className="shrink-0 text-[var(--muted)]" />{t("a2hs.b1")}</li>
        <li className="flex items-center gap-2.5"><Smartphone size={19} aria-hidden className="shrink-0 text-[var(--muted)]" />{t("a2hs.b2")}</li>
      </ul>
      {mode === "android" ? (
        <>
          <SheetPrimary onClick={install}><Download size={20} strokeWidth={2.4} aria-hidden /> {t("a2hs.install")}</SheetPrimary>
          <SheetGhost onClick={dismiss}>{t("a2hs.later")}</SheetGhost>
        </>
      ) : (
        <>
          <p className="mt-5 flex items-center gap-2.5 rounded-[14px] bg-[var(--ink3)] px-3.5 py-3 text-left text-[14px] font-bold leading-snug text-[var(--cream)]">
            <Share size={18} aria-hidden className="shrink-0 text-[var(--win)]" />{t("a2hs.ios")}
          </p>
          <SheetPrimary onClick={dismiss}>{t("a2hs.ok")}</SheetPrimary>
        </>
      )}
    </BottomSheet>
  );
}
