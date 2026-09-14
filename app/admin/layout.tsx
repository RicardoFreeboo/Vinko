import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("admin.title") };

// PASO 5 — Consola /admin (role=admin). El gate real de rol llega con el login
// (PASO 3); mientras, banner honesto + noindex global (LEGAL_LOCK).
const NAV_KEYS = [
  "admin.nav.hub", "admin.nav.metricas", "admin.nav.moderacion",
  "admin.nav.temas", "admin.nav.health", "admin.nav.live",
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const labels: Record<string, string> = {};
  for (const k of NAV_KEYS) labels[k] = t(k);

  return (
    <div className="amb min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-5 py-6">
        <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5">
          <div className="flex items-center justify-between gap-3">
            <Logo mark={30} word={22} />
            <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted2)]">
              {t("admin.title")}
            </span>
          </div>
          <AdminNav labels={labels} />
          <p className="rounded-[10px] border border-[var(--gold)]/40 bg-[var(--gold)]/5 px-3 py-2 text-[12px] leading-snug text-[var(--gold)]">
            {t("admin.restricted")}
          </p>
        </header>
        <main className="py-6">{children}</main>
      </div>
    </div>
  );
}
