import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Perfil público — SOLO usuarios reales (sin perfiles demo). Sin backend o sin
// handle → 404.
export default async function UserProfile({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const sb = await supabaseServer();
  if (!sb) notFound();
  const { data } = await sb
    .from("profiles")
    .select("handle, points")
    .eq("handle", handle)
    .maybeSingle();
  if (!data) notFound();

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-6 px-5 py-8">
      <Logo mark={28} word={20} />
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ink3)] text-2xl font-black text-[var(--win)]">
          {data.handle?.slice(0, 2).toUpperCase()}
        </div>
        <div className="text-xl font-black">@{data.handle}</div>
      </div>
      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] p-4 text-center">
        <div className="mono text-3xl font-black text-[var(--win)]">🪙 {data.points ?? 0}</div>
        <div className="mt-1 text-[12px] text-[var(--muted)]">{t("u.points")}</div>
      </div>
    </main>
  );
}
