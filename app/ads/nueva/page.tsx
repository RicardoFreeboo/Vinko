import Link from "next/link";
import type { Metadata } from "next";
import { getMemberSession } from "@/lib/session";
import { AdsNuevaClient } from "@/components/ads/AdsNuevaClient";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// A2–A5 · Crear campaña de VINKO ADS. Flujo tras login (cualquier usuario puede
// ser anunciante). No indexable: es parte del panel de anunciantes.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("ads.nueva.title"), robots: { index: false, follow: false } };

export default async function AdsNueva() {
  const session = await getMemberSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("ads.nueva.login")}</p>
        <Link href="/login?next=/ads/nueva" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("ads.nueva.loginCta")}
        </Link>
      </main>
    );
  }
  return <AdsNuevaClient />;
}
