import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { BuzonClient } from "@/components/BuzonClient";
import { ArbiterPanel } from "@/components/ArbiterPanel";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("buzon.title"), robots: { index: false, follow: false } };

// Lo que me toca hacer (my_pending, 0031): porras cerradas que debo resolver,
// invitaciones a ser juez y cuántas mías siguen abiertas.
type Pending = {
  to_resolve: { slug: string; title: string; closes_at: string }[];
  arbiter_invites: { id: string; slug: string; title: string }[];
  open_created: number;
};

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

export default async function Buzon() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("buzon.login")}</p>
        <Link href="/login?next=/buzon" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  const [{ data: items }, pend] = await Promise.all([
    sb!
      .from("notifications")
      .select("id, class, title, body, url, read_at, created_at")
      .eq("user_id", session.id)
      .order("created_at", { ascending: false })
      .limit(50),
    sb!.rpc("my_pending"),
  ]);
  // Sin la migración 0031 la RPC no existe: el bloque simplemente no sale.
  const pending = (pend.error ? null : pend.data) as Pending | null;
  const hasPending = !!pending && (pending.to_resolve.length > 0 || pending.arbiter_invites.length > 0);

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
      </header>
      <h1 className="text-2xl font-black">{t("buzon.title")}</h1>

      {hasPending && pending && (
        <section className="flex flex-col gap-3 rounded-[16px] border border-[var(--gold)] bg-[var(--ink2)] p-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">{t("buzon.pending")}</p>

          {pending.to_resolve.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-bold text-[var(--cream)]">{t("buzon.toResolve")}</p>
              {pending.to_resolve.map((p) => (
                <Link key={p.slug} href={`/p/${p.slug}`}
                  className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--ink)] px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-bold text-[var(--cream)]">{p.title}</span>
                    <span className="text-[11px] text-[var(--muted)]">{t("buzon.closedAt", { date: fmtDate(p.closes_at) })}</span>
                  </span>
                  <span className="mono shrink-0 text-[12px] font-black text-[var(--win)]">{t("buzon.resolveCta")}</span>
                </Link>
              ))}
            </div>
          )}

          {pending.arbiter_invites.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-bold text-[var(--cream)]">{t("buzon.invites")}</p>
              {pending.arbiter_invites.map((p) => (
                <ArbiterPanel key={p.id} porraId={p.id} slug={p.slug} title={p.title} compact />
              ))}
            </div>
          )}

          {pending.open_created > 0 && (
            <p className="text-[11px] text-[var(--muted)]">
              {pending.open_created === 1 ? t("buzon.openCreatedOne") : t("buzon.openCreated", { n: String(pending.open_created) })}
            </p>
          )}
        </section>
      )}

      <BuzonClient items={items ?? []} />
      <AppNav />
    </main>
  );
}
