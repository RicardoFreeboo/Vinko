import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OnboardingFlow, type OnboardingProfile } from "@/components/OnboardingFlow";
import { A2HSPrompt } from "@/components/A2HSPrompt";
import onbEs from "@/messages/parts/onboarding.es.json";
import { t } from "@/lib/i18n";

// Vista previa del onboarding SOLO en desarrollo (capturas, diseño): sin
// sesión, sin backend, sin navegación. Usa las claves de messages/parts
// aunque aún no estén fusionadas en es.json. En producción → 404.
// Uso: /bienvenida/preview?paso=1|2|3[&next=/p/algo]
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("age.title"), robots: { index: false, follow: false } };

const MOCK: OnboardingProfile = {
  id: "preview",
  handle: "ricardo",
  birthYear: null,
  lang: "es",
  avatarUrl: null,
  interests: [],
  onboarded: false,
  shields: 1,
};

export default async function BienvenidaPreview({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string; next?: string; a2hs?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { paso, next, a2hs } = await searchParams;
  const step = paso === "2" || paso === "3" ? (Number(paso) as 2 | 3) : 1;
  const safeNext = next && next.startsWith("/") ? next : "/feed";
  const a2hsMode = a2hs === "ios" || a2hs === "android" ? a2hs : undefined;
  return (
    <>
      <OnboardingFlow
        mock
        dict={onbEs as Record<string, string>}
        next={safeNext}
        profile={{ ...MOCK, interests: step >= 3 ? ["futbol", "memes", "series"] : [] }}
        startStep={step}
      />
      {a2hsMode && <A2HSPrompt preview={a2hsMode} />}
    </>
  );
}
