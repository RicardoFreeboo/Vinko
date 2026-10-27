import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { getMemberSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// A6 · Panel del anunciante (VINKO_PANTALLAS). Lista las campañas del usuario con
// su estado y cifras REALES de la BD (en borrador son 0). El bloque "qué opina tu
// público" solo tendrá datos cuando la predicción esté activa y haya ≥ min_cell
// votos (dato agregado, nunca individual). SIN moneda del jugador: cifras del
// anunciante (B2B). No indexable.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("ads.panel.title"), robots: { index: false, follow: false } };

type Campaign = {
  id: string; status: string; format: string; market: string | null;
  cities: string[] | null; budget_cents: number; price_per_vote_cents: number;
  spent_cents: number; votes: number; draft_question: string | null; created_at: string;
};

const STATUS: Record<string, { key: string; color: string; dot?: boolean }> = {
  draft:     { key: "ads.panel.status.draft", color: "var(--muted2)" },
  in_review: { key: "ads.panel.status.in_review", color: "var(--gold)" },
  active:    { key: "ads.panel.status.active", color: "var(--win)", dot: true },
  paused:    { key: "ads.panel.status.paused", color: "var(--muted)" },
  ended:     { key: "ads.panel.status.ended", color: "var(--muted2)" },
  rejected:  { key: "ads.panel.status.rejected", color: "var(--red)" },
};

const usd = (cents: number) => (cents / 100).toLocaleString("es-CO", { minimumFractionDigits: cents % 100 ? 2 : 0 });

function AdsLogo() {
  return (
    <span className="flex items-center gap-2">
      <Logo mark={28} word={20} />
      <span className="mono rounded-md bg-[var(--gold)] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--ink)]">
        {t("ads.label")}
      </span>
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-3">
      <div className="eyebrow text-[10px] text-[var(--muted)]">{label}</div>
      <div className="mono mt-1.5 text-[22px] font-bold leading-none text-[var(--cream)]">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

function CampaignCard({ c }: { c: Campaign }) {
  const st = STATUS[c.status] ?? STATUS.draft;
  const cities = (c.cities ?? []).length ? (c.cities ?? []).join(" · ") : t("ads.nueva.cityAll");
  const fmt = c.format === "sponsored_porra" ? t("ads.nueva.fmt.porra.name") : c.format;
  const market = c.market === "CO" ? "Colombia" : (c.market ?? "");
  const hasVotes = c.votes > 0;

  return (
    <section className="rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-5">
      <div className="flex items-center gap-2">
        <span
          className="mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: `color-mix(in srgb, ${st.color} 14%, transparent)`, color: st.color }}
        >
          {st.dot && <i className="h-[7px] w-[7px] rounded-full" style={{ background: st.color }} />}
          {t(st.key)}
        </span>
      </div>

      <h2 className="mt-3 text-[18px] font-black leading-tight text-[var(--cream)]">
        {c.draft_question || fmt}
      </h2>
      <p className="mt-1 text-[13px] text-[var(--muted)]">{[fmt, market, cities].filter(Boolean).join(" · ")}</p>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <StatCard label={t("ads.panel.votes")} value={c.votes.toLocaleString("es-CO")} />
        <StatCard label={t("ads.panel.cpv")} value={usd(c.price_per_vote_cents)} sub="USD" />
        <StatCard label={t("ads.panel.spent")} value={usd(c.spent_cents)} sub={t("ads.panel.spentOf", { total: usd(c.budget_cents) })} />
      </div>

      <div className="mt-3 rounded-[16px] border border-[var(--line)] bg-[var(--ink3)] p-4">
        <b className="text-[15px] text-[var(--cream)]">{t("ads.panel.opinion")}</b>
        {!hasVotes && <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{t("ads.panel.opinionSoon", { n: "50" })}</p>}
      </div>

      {c.status === "draft" && <p className="mt-3 text-[12.5px] text-[var(--muted2)]">{t("ads.panel.draftNote")}</p>}
    </section>
  );
}

export default async function AdsPanel() {
  const session = await getMemberSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("ads.panel.login")}</p>
        <Link href="/login?next=/ads/panel" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]">
          {t("ads.panel.loginCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  let campaigns: Campaign[] = [];
  if (sb) {
    const { data } = await sb
      .from("ad_campaigns")
      .select("id, status, format, market, cities, budget_cents, price_per_vote_cents, spent_cents, votes, draft_question, created_at")
      .order("created_at", { ascending: false });
    campaigns = (data ?? []) as unknown as Campaign[];
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-5 px-5 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <AdsLogo />
        <Link
          href="/ads/nueva"
          className="flex items-center gap-1.5 rounded-full bg-[var(--win)] px-4 py-2 text-[13px] font-black text-[var(--ink)]"
          style={{ boxShadow: "0 4px 0 var(--windeep)" }}
        >
          <Plus size={16} strokeWidth={2.6} /> {t("ads.panel.new")}
        </Link>
      </header>

      <h1 className="text-[1.7rem] font-black tracking-[-0.02em] text-[var(--cream)]">{t("ads.panel.title")}</h1>

      {campaigns.length === 0 ? (
        <div className="mt-4 rounded-[20px] border border-dashed border-[var(--line)] bg-[var(--ink2)] p-8 text-center">
          <p className="text-[16px] font-black text-[var(--cream)]">{t("ads.panel.empty")}</p>
          <p className="mx-auto mt-2 max-w-[360px] text-[14px] leading-relaxed text-[var(--muted)]">{t("ads.panel.emptySub")}</p>
          <Link
            href="/ads/nueva"
            className="mt-5 inline-flex h-[50px] items-center justify-center rounded-full bg-[var(--win)] px-7 text-[15px] font-black text-[var(--ink)]"
            style={{ boxShadow: "0 5px 0 var(--windeep)" }}
          >
            {t("ads.panel.create")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {campaigns.map((c) => <CampaignCard key={c.id} c={c} />)}
        </div>
      )}
    </main>
  );
}
