import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { OnboardingFlow, type OnboardingProfile } from "@/components/OnboardingFlow";
import { t } from "@/lib/i18n";

// /bienvenida — onboarding en 3 pantallas (spec F-08). El servidor decide en
// qué paso arranca: sin año de nacimiento → 1; sin onboarded_at → 2; todo
// hecho → sigue a `next`. `?paso=1|2|3` fuerza un paso (QA / repetir avatar).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("age.title"), robots: { index: false, follow: false } };

type Row = {
  handle: string; birth_year: number | null; lang: string | null; avatar_url: string | null;
  interests?: string[] | null; onboarded_at?: string | null; streak_shields?: number | null;
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

  // Con 0036 aplicada hay interests/onboarded_at; si no, se lee lo básico.
  let row: Row | null = null;
  const full = await sb.from("profiles")
    .select("handle, birth_year, lang, avatar_url, interests, onboarded_at, streak_shields")
    .eq("id", user.id).maybeSingle();
  if (full.error) {
    const basic = await sb.from("profiles")
      .select("handle, birth_year, lang, avatar_url, streak_shields")
      .eq("id", user.id).maybeSingle();
    row = basic.data as Row | null;
  } else {
    row = full.data as Row | null;
  }
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
  };

  const forced = paso === "1" || paso === "2" || paso === "3" ? (Number(paso) as 1 | 2 | 3) : undefined;
  if (!forced && profile.birthYear && profile.onboarded) redirect(safeNext);

  return <OnboardingFlow next={safeNext} profile={profile} startStep={forced} />;
}
