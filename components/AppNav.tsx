"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Users, Compass, Plus, Trophy, CircleUser, type LucideIcon } from "lucide-react";
import { ensurePushSubscription, registerSW } from "@/lib/push";
import { t } from "@/lib/i18n";

// Barra inferior de la app logueada (nunca en /p — la landing pública va limpia).
// Diseño del soft launch (VINKO_PANTALLAS §2): 5 pestañas con iconos Lucide —
// Grupos · Descubrir · Crear (botón central elevado) · Liga · Perfil. Activa en
// verde, etiquetas en mayúsculas. Oculta en escritorio (ahí manda DesktopShell).
const TABS: ReadonlyArray<{ href: string; key: string; Icon: LucideIcon; primary: boolean }> = [
  { href: "/grupos", key: "nav.grupos", Icon: Users, primary: false },
  { href: "/feed", key: "nav.descubrir", Icon: Compass, primary: false },
  { href: "/nueva", key: "nav.crear", Icon: Plus, primary: true },
  { href: "/liga", key: "nav.liga", Icon: Trophy, primary: false },
  { href: "/perfil", key: "nav.perfil", Icon: CircleUser, primary: false },
];

export function AppNav() {
  const path = usePathname();

  useEffect(() => {
    // Registrar el SW SIEMPRE (aunque no haya permiso de push): sin esto Chrome
    // no dispara beforeinstallprompt y la PWA no es instalable en Android.
    void registerSW();
    // Revalidar la suscripción push en CADA apertura (iOS la cancela solo, §5.1)
    void ensurePushSubscription();
  }, [path]);

  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[430px] items-stretch justify-around border-t border-[var(--line)] bg-[var(--ink)]/95 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 backdrop-blur lg:hidden"
    >
      {TABS.map((tab) => {
        const active = path === tab.href || path?.startsWith(tab.href + "/");
        const Icon = tab.Icon;
        if (tab.primary) {
          // CREAR: botón central elevado (FAB redondo verde con brillo).
          return (
            <Link key={tab.href} href={tab.href} aria-label={t(tab.key)}
              className="relative flex flex-1 flex-col items-center justify-end gap-1 text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-[var(--cream)]">
              <span className="absolute -top-4 grid h-[54px] w-[54px] place-items-center rounded-full bg-[var(--win)] text-[var(--ink)] shadow-[0_0_20px_rgba(31,224,122,0.45),0_0_0_5px_var(--ink)]">
                <Icon size={26} strokeWidth={2.6} aria-hidden />
              </span>
              {t(tab.key)}
            </Link>
          );
        }
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.04em] ${
              active ? "text-[var(--win)]" : "text-[var(--muted2)]"
            }`}
          >
            <Icon size={23} strokeWidth={active ? 2.5 : 2} aria-hidden />
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
