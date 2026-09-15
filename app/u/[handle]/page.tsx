import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { editorialBySlug } from "@/lib/editorial";
import { Logo, VMark } from "@/components/Logo";
import { VinkoCoin } from "@/components/VinkoCoin";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${handle}`, robots: { index: false, follow: false } };
}

type Row = { id: string; slug: string; title: string; source: string; status: string; media_url: string | null; media_kind: string | null };

function videoOf(r: Row): string | null {
  return editorialBySlug(r.slug)?.video ?? (r.media_kind === "video" ? r.media_url : null);
}

export default async function UserProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sb = await supabaseServer();
  if (!sb) notFound();

  const { data: p } = await sb.from("profiles")
    .select("id, handle, avatar_url, points, xp, marcador_total, division, streak_days, streak_best")
    .eq("handle", handle).maybeSingle();
  if (!p) notFound();

  const session = await getSession();
  const isMe = session?.id === p.id;

  const [{ data: created }, { data: played }, { data: stats }] = await Promise.all([
    sb.rpc("profile_created", { p_user: p.id }),
    sb.rpc("profile_played", { p_user: p.id }),
    sb.rpc("profile_stats", { p_user: p.id }),
  ]);
  const s = (stats ?? {}) as { created?: number; played?: number; hits?: number };
  const DIV: Record<string, string> = { bronce: "Bronce", plata: "Plata", oro: "Oro", diamante: "Diamante", leyenda: "Leyenda" };

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-28 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={26} word={18} />
        {isMe && <Link href="/saldo" className="mono text-[11px] text-[var(--win)]">{t("u.edit")}</Link>}
      </header>

      {/* cabecera del perfil */}
      <section className="flex items-center gap-4">
        {p.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-full bg-[var(--ink3)] text-3xl font-black text-[var(--win)]">
            {p.handle?.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <div className="text-2xl font-black text-[var(--cream)]">@{p.handle}</div>
          <div className="mono mt-1 text-xs text-[var(--gold)]">{DIV[p.division] ?? p.division} · 🔥 {p.streak_days}</div>
        </div>
      </section>

      {/* estadísticas */}
      <div className="grid grid-cols-3 gap-2">
        <St icon={<VinkoCoin size={14} />} v={p.points} l={t("saldo.coins")} c="var(--gold)" />
        <St icon="▲" v={p.xp} l={t("saldo.level")} c="var(--win)" />
        <St icon="🎯" v={p.marcador_total} l={t("saldo.skill")} c="var(--cream)" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <St v={s.created ?? 0} l={t("u.created")} c="var(--cream)" />
        <St v={s.played ?? 0} l={t("u.played")} c="var(--cream)" />
        <St v={s.hits ?? 0} l={t("u.hits")} c="var(--win)" />
      </div>

      {/* SECCIÓN 1 — porras creadas */}
      <Section title={t("u.createdSection")} rows={(created ?? []) as Row[]} empty={t("u.noCreated")} />
      {/* SECCIÓN 2 — porras jugadas */}
      <Section title={t("u.playedSection")} rows={(played ?? []) as Row[]} empty={t("u.noPlayed")} />

      <AppNav />
    </main>
  );
}

function St({ icon, v, l, c }: { icon?: React.ReactNode; v: number; l: string; c: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-2 py-2.5 text-center">
      <div className="mono flex items-center justify-center gap-1 text-[15px] font-black leading-none" style={{ color: c }}>{icon} {v}</div>
      <div className="mt-1 text-[9px] uppercase tracking-wide text-[var(--muted)]">{l}</div>
    </div>
  );
}

function Section({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-black text-[var(--cream)]">{title}</h2>
        <span className="mono text-[11px] text-[var(--muted)]">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{empty}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {rows.map((r) => {
            const v = videoOf(r);
            return (
              <Link key={r.id} href={`/p/${r.slug}`}
                className="relative aspect-square overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--ink3)]">
                {v ? (
                  <video src={v} muted loop playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center"><VMark size={22} /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
                {r.status === "resolved" && <span className="absolute right-1 top-1 text-[10px]">✓</span>}
                <p className="absolute inset-x-0 bottom-0 line-clamp-2 p-1.5 text-[9px] font-bold leading-tight text-white">{r.title}</p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
