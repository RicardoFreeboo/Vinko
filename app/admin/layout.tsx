import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { Backstage } from "@/components/backstage/ui";
import { Logo } from "@/components/Logo";
import { spaceGrotesk, jetbrainsMono, inter } from "@/lib/backstage/fonts";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("admin.title") };

// Consola /admin — sala de control (spec de paneles). Fuentes de consola solo
// aquí; el juego del jugador no las carga. role=admin real vía is_admin().
const NAV_KEYS = [
  "admin.nav.hub", "admin.nav.metricas", "admin.nav.flujo", "admin.nav.moderacion",
  "admin.nav.temas", "admin.nav.health", "admin.nav.live",
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const labels: Record<string, string> = {};
  for (const k of NAV_KEYS) labels[k] = t(k);

  return (
    <div className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable}`}
      style={{ fontFamily: "var(--font-body), system-ui" }}>
      <Backstage>
        <div className="mx-auto w-full max-w-[1200px] px-5 py-6">
          <header className="flex flex-col gap-4 border-b border-[rgba(31,224,122,0.15)] pb-5">
            <div className="flex items-center justify-between gap-3">
              <Logo mark={30} word={22} />
              <span className="text-[11px] uppercase tracking-[0.16em] text-[rgba(244,241,233,0.5)]"
                style={{ fontFamily: "var(--font-mono2), monospace" }}>
                {t("admin.title")} · CTRL
              </span>
            </div>
            <AdminNav labels={labels} />
          </header>
          <main className="py-6">{children}</main>
        </div>
      </Backstage>
    </div>
  );
}
