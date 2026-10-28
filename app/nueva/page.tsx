import Link from "next/link";
import type { Metadata } from "next";
import { X } from "lucide-react";
import { getMemberSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { NuevaClient } from "@/components/NuevaClient";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("nueva06.title"), robots: { index: false, follow: false } };

// CREAR (VINKO_PANTALLAS 06): pantalla a solas, sin barra de pestañas; la X
// vuelve al grupo (si vienes de uno) o a Inicio.
export default async function Nueva({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  // FX-11: /nueva?g=<groupId> crea la predicción PARA el grupo (privada).
  const { g } = await searchParams;
  const groupId = g && /^[0-9a-f-]{36}$/.test(g) ? g : null;
  const session = await getMemberSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("nueva.login")}</p>
        <Link href="/login?next=/nueva" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  // «Para»: tus grupos, el último al que entraste primero (RLS gm_read_member: tus filas).
  const sb = await supabaseServer();
  const { data: mine } = sb
    ? await sb.from("group_members").select("joined_at, groups ( id, name )")
      .eq("user_id", session.id).order("joined_at", { ascending: false })
    : { data: null };
  const groups = (mine ?? []).flatMap((m: { groups: unknown }) => {
    const gr = (Array.isArray(m.groups) ? m.groups[0] : m.groups) as { id?: string; name?: string } | null;
    return gr?.id && gr.name ? [{ id: gr.id, name: gr.name }] : [];
  });

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-[18px] pb-10 pt-4">
      <header className="relative flex h-12 items-center justify-center">
        <Link href={groupId ? `/g/${groupId}` : "/grupos"} aria-label={t("nueva06.close")}
          className="absolute left-0 grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--ink2)] text-[var(--cream)]">
          <X size={20} strokeWidth={2.2} />
        </Link>
        <h1 className="text-[18px] font-black tracking-[-0.01em]">{t("nueva06.title")}</h1>
      </header>
      <NuevaClient userId={session.id} handle={session.handle} groupId={groupId} groups={groups} />
    </main>
  );
}
