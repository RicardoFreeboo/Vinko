import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { AjustesClient } from "@/components/AjustesClient";
import { AppNav } from "@/components/AppNav";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// /ajustes (RGPD, spec F-10): cuenta, idioma, consentimiento de analítica,
// descarga de datos y borrado de cuenta. Solo con sesión; si no, al login
// con vuelta aquí.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: t("ajustes.title"),
  robots: { index: false, follow: false },
};

export default async function Ajustes() {
  const session = await getSession();
  if (!session) redirect("/login?next=/ajustes");

  const sb = await supabaseServer();
  const { data } = sb
    ? await sb.from("profiles").select("lang").eq("id", session.id).maybeSingle()
    : { data: null };
  const lang: "es" | "en" = data?.lang === "en" ? "en" : "es";
  // Mismo criterio que el layout: analítica solo si vinko_consent === "1".
  const consent = (await cookies()).get("vinko_consent")?.value === "1";

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-4 pb-28 pt-5">
      <header className="flex items-center justify-between">
        <Link href="/perfil"><Logo mark={28} word={20} /></Link>
        <Link href="/perfil" className="mono text-xs text-[var(--muted)]">← {t("ajustes.back")}</Link>
      </header>
      <h1 className="text-2xl font-black text-[var(--cream)]">{t("ajustes.title")}</h1>
      <AjustesClient
        userId={session.id}
        handle={session.handle}
        email={session.email}
        lang={lang}
        consent={consent}
      />
      <AppNav />
    </main>
  );
}
