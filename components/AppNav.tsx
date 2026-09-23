"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ensurePushSubscription, registerSW } from "@/lib/push";
import { supabaseBrowser } from "@/lib/supabase/client";
import { VinkoCoin } from "@/components/VinkoCoin";
import { t } from "@/lib/i18n";

// Marca la ENTRADA del día para la racha (cuenta abrir la app, no solo picar).
// IMPORTANTE: el día NO se marca como hecho hasta que el servidor confirma, y
// solo se cuenta con sesión ya cargada. Si no, una primera llamada que falla o
// llega antes de que la sesión esté lista dejaría la racha sin contar TODO el
// día (el servidor deduplica, pero nunca llegaría a contar). Al confirmar,
// refrescamos para que la racha (server component) se vea actualizada ya.
async function tickDailyOpen(refresh: () => void) {
  let today: string;
  try {
    today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("vinko_open") === today) return;
  } catch {
    today = new Date().toISOString().slice(0, 10);
  }
  const sb = supabaseBrowser();
  if (!sb) return;
  try {
    // Sin sesión aún: no contamos ni marcamos; se reintenta en la próxima
    // navegación, cuando la sesión ya esté disponible.
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const { error } = await sb.rpc("daily_open");
    if (error) return; // no marcar hecho: que reintente
    try { localStorage.setItem("vinko_open", today); } catch { /* noop */ }
    refresh();
  } catch { /* red caída: se reintenta al navegar */ }
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
  const router = useRouter();

  useEffect(() => {
    // Registrar el SW SIEMPRE (aunque no haya permiso de push): sin esto Chrome
    // no dispara beforeinstallprompt y la PWA no es instalable en Android.
    void registerSW();
    // Revalidar la suscripción push en CADA apertura (iOS la cancela solo, §5.1)
    void ensurePushSubscription();
    // Racha: marcar la entrada del día (una vez/día, solo si el servidor la cuenta).
    void tickDailyOpen(() => router.refresh());
  }, [path, router]);

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
