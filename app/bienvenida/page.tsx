import type { Metadata } from "next";
import { fetchMe } from "@/lib/me";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { OnboardingFlow, type OnboardingProfile } from "@/components/OnboardingFlow";
import { ipCountry } from "@/lib/geo";
import { t } from "@/lib/i18n";

// /bienvenida — onboarding en 3 pantallas (spec F-08). El servidor decide en
// qué paso arranca: sin año de nacimiento → 1; sin onboarded_at → 2; todo
// hecho → sigue a `next`. `?paso=1|2|3` fuerza un paso (QA / repetir avatar).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("age.title"), robots: { index: false, follow: false } };

type Row = {
  handle: string; birth_year: number | null; lang: string | null; avatar_url: string | null;
  interests?: string[] | null; onboarded_at?: string | null; streak_shields?: number | null;
  country?: string | null;
};

export default async function Bienvenida({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; paso?: string }>;
}) {
  const { next, paso } = await searchParams;
  const safeNext = next && next.startsWith("/") ? next : "/feed";

  const sb = await supabaseServer();
  if (!sb) redirect("/login");
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNext)}`);

  // SEC-01: perfil propio completo vía me() (fallback interno si 0055 no está).
  const row = (await fetchMe(sb)) as unknown as Row | null;
  if (!row) redirect("/login");

  const profile: OnboardingProfile = {
    id: user.id,
    handle: row.handle,
    birthYear: row.birth_year ?? null,
    lang: row.lang === "en" ? "en" : "es",
    avatarUrl: row.avatar_url ?? null,
    interests: row.interests ?? [],
    onboarded: !!row.onboarded_at,
    shields: row.streak_shields ?? null,
    country: row.country ?? null,
  };

  const forced = paso === "1" || paso === "2" || paso === "3" ? (Number(paso) as 1 | 2 | 3) : undefined;
  if (!forced && profile.birthYear && profile.onboarded) redirect(safeNext);

  // Sugerencia de país por IP (Vercel); null en local. No bloquea nada.
  const suggestedCountry = await ipCountry();

  return <OnboardingFlow next={safeNext} profile={profile} startStep={forced} suggestedCountry={suggestedCountry} />;
}
