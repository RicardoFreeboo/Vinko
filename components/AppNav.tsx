"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ensurePushSubscription, registerSW } from "@/lib/push";
import { supabaseBrowser } from "@/lib/supabase/client";
import { VinkoCoin } from "@/components/VinkoCoin";
import { t } from "@/lib/i18n";

// Marca la ENTRADA del día para la racha (una sola vez al día por navegador; el
// servidor es idempotente de todas formas). Cuenta abrir la app, no solo picar.
function tickDailyOpen() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("vinko_open") === today) return;
    localStorage.setItem("vinko_open", today);
  } catch { /* sin localStorage: se llama igual, el servidor deduplica */ }
  try { void supabaseBrowser()?.rpc("daily_open"); } catch { /* noop */ }
}

// Navegación inferior de la app logueada (nunca en /p — la landing pública va
// limpia). Las notificaciones ya NO viven aquí: son la campana de la esquina
// (header del Feed). Orden: Feed · Perfil · Crear · Grupos · Liga · Vinkos.
const TABS: ReadonlyArray<{ href: string; key: string; icon: React.ReactNode; primary: boolean }> = [
  { href: "/feed", key: "nav.feed", icon: "▦", primary: false },
  { href: "/perfil", key: "nav.perfil", icon: "◉", primary: false },
  { href: "/nueva", key: "nav.crear", icon: "＋", primary: true },
  { href: "/grupos", key: "nav.grupos", icon: "⌂", primary: false },
  { href: "/liga", key: "nav.liga", icon: "▲", primary: false },
  { href: "/cartera", key: "nav.cartera", icon: <VinkoCoin size={16} />, primary: false },
];

export function AppNav() {
  const path = usePathname();

  useEffect(() => {
    // Registrar el SW SIEMPRE (aunque no haya permiso de push): sin esto Chrome
    // no dispara beforeinstallprompt y la PWA no es instalable en Android.
    void registerSW();
    // Revalidar la suscripción push en CADA apertura (iOS la cancela solo, §5.1)
    void ensurePushSubscription();
    // Racha: marcar la entrada del día (una vez/día por navegador).
    tickDailyOpen();
  }, [path]);

  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[430px] items-stretch justify-around border-t border-[var(--line)] bg-[var(--ink)]/95 backdrop-blur lg:hidden"
    >
      {TABS.map((tab) => {
        const active = path === tab.href || path?.startsWith(tab.href + "/");
        if (tab.primary) {
          // CREAR: botón central elevado, siempre visible
          return (
            <Link key={tab.href} href={tab.href} aria-label={t(tab.key)}
              className="relative -mt-5 flex flex-1 flex-col items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--win)]">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--win)] text-2xl font-black leading-none text-[var(--ink)] shadow-[0_0_20px_rgba(31,224,122,0.45)]">
                {tab.icon}
              </span>
              {t(tab.key)}
            </Link>
          );
        }
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wide ${
              active ? "text-[var(--win)]" : "text-[var(--muted)]"
            }`}
          >
            <span aria-hidden className="text-base leading-none">{tab.icon}</span>
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
