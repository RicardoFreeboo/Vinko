import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { SponsorBadge, tSponsors as t, type SponsorshipPublic } from "@/components/SponsorBadge";

// Informe de marca (M-02): vista pública con token (?t=) que llama a
// sponsor_report (0039). Datos agregados, sin PII; el presupuesto jamás sale.
// Es lo que se enseña en la reunión de venta: móvil primero y usable sin JS
// (el CSV es un enlace data: generado en servidor; el hover del gráfico es
// <title> nativo del SVG).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("sponsors.report.title"), robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Day = { day: string; impressions: number; unique_reach: number; participants: number; cta_clicks: number; shares: number; picks: number };
type Totals = Omit<Day, "day">;
type PrizeRow = { rank_from: number; rank_to: number; description_es: string; description_en: string | null; quantity: number; awarded: number; delivered: number };
type Report = {
  id: string; status: string; target_type: string; target_label: string | null; target_url: string | null;
  starts_at: string; ends_at: string;
  sponsor: { name: string; logo_url: string | null; url: string | null };
  disclosure_label: string | null; cta_text_es: string | null; cta_text_en: string | null; cta_url: string | null;
  banner_url: string | null; totals: Partial<Totals> | null; days: Day[] | null; prizes: PrizeRow[] | null; generated_at: string;
};
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const nf = new Intl.NumberFormat("es-ES");
const fmtDate = (iso: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(iso));
const fmtDay = (d: string) => { const [, m, dd] = d.split("-"); return `${dd}/${m}`; };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export default async function SponsorReportPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const token = Array.isArray(sp.t) ? sp.t[0] : sp.t;

  let rep: Report | null = null;
  if (UUID.test(id) && token && token.length >= 8) {
    const sb = await supabaseServer();
    if (sb) {
      const { data, error } = await sb.rpc("sponsor_report", { p_id: id, p_token: token });
      if (!error && data && typeof data === "object") rep = data as Report;
    }
  }
  if (!rep) return <NotAvailable />;

  const days: Day[] = Array.isArray(rep.days) ? rep.days : [];
  const tot: Totals = {
    impressions: num(rep.totals?.impressions), unique_reach: num(rep.totals?.unique_reach),
    participants: num(rep.totals?.participants), cta_clicks: num(rep.totals?.cta_clicks),
    shares: num(rep.totals?.shares), picks: num(rep.totals?.picks),
  };
  const prizes: PrizeRow[] = Array.isArray(rep.prizes) ? rep.prizes : [];
  const badge: SponsorshipPublic = {
    id: rep.id, target_type: rep.target_type, target_id: null,
    sponsor_name: rep.sponsor?.name ?? "—", sponsor_logo_url: rep.sponsor?.logo_url ?? null, sponsor_url: rep.sponsor?.url ?? null,
    cta_text_es: rep.cta_text_es, cta_text_en: rep.cta_text_en, cta_url: rep.cta_url,
    disclosure_label: rep.disclosure_label, banner_url: rep.banner_url, starts_at: rep.starts_at, ends_at: rep.ends_at,
  };
  const kpis: [string, number][] = [
    [t("sponsors.report.reach"), tot.unique_reach],
    [t("sponsors.report.participants"), tot.participants],
    [t("sponsors.report.ctaClicks"), tot.cta_clicks],
    [t("sponsors.report.shares"), tot.shares],
    [t("sponsors.report.picks"), tot.picks],
    [t("sponsors.report.impressions"), tot.impressions],
  ];
  const cols: [string, keyof Totals][] = [
    [t("sponsors.report.impressions"), "impressions"], [t("sponsors.report.reach"), "unique_reach"],
    [t("sponsors.report.ctaClicks"), "cta_clicks"], [t("sponsors.report.shares"), "shares"], [t("sponsors.report.picks"), "picks"],
  ];
  // CSV en servidor → enlace data: (descarga en cliente sin JS ni endpoint)
  const csvLine = (cells: (string | number)[]) => cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",");
  const csv = [
    csvLine([t("sponsors.report.day"), ...cols.map(([l]) => l), t("sponsors.report.participants")]),
    ...days.map((d) => csvLine([d.day, ...cols.map(([, k]) => num(d[k])), num(d.participants)])),
  ].join("\r\n");
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + csv)}`;
  const recent = days.slice(-14).reverse();
  const statusKey = `sponsors.report.status.${rep.status}`;
  const statusTxt = t(statusKey) === statusKey ? rep.status : t(statusKey);
  const targetTxt = rep.target_label ?? t(`admin.sponsors.type.${rep.target_type}`);

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-12 pt-6 md:max-w-[720px]">
      <header className="flex items-center justify-between">
        <Logo mark={26} word={18} />
        <span className="eyebrow text-[10px]">{t("sponsors.report.eyebrow")}</span>
      </header>

      <section>
        <h1 className="text-2xl font-black text-[var(--cream)]">{t("sponsors.report.title")}</h1>
        <div className="mt-3"><SponsorBadge s={badge} size="md" cta /></div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-[var(--muted)]">{t("sponsors.report.target")}</dt>
          <dd className="text-[var(--cream)]">{targetTxt}</dd>
          <dt className="text-[var(--muted)]">{t("sponsors.report.period")}</dt>
          <dd className="mono text-[var(--cream)]">{fmtDate(rep.starts_at)} → {fmtDate(rep.ends_at)}</dd>
          <dt className="text-[var(--muted)]">{t("sponsors.report.status")}</dt>
          <dd>
            <span className={`mono rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${rep.status === "live" ? "border-[var(--win)] text-[var(--win)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
              {statusTxt}
            </span>
          </dd>
        </dl>
      </section>

      {/* cifras de cabecera */}
      <section className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {kpis.map(([label, value]) => (
          <div key={label} className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-3">
            <div className="mono text-[22px] font-black leading-none text-[var(--cream)]">{nf.format(value)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
          </div>
        ))}
      </section>

      {/* evolución diaria: dos series en gráficos separados (escalas distintas) */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-bold text-[var(--cream)]">{t("sponsors.report.daily")}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Serie title={t("sponsors.report.impressionsPerDay")} days={days} pick={(d) => num(d.impressions)} />
          <Serie title={t("sponsors.report.picksPerDay")} days={days} pick={(d) => num(d.picks)} />
        </div>
        {recent.length > 0 && (
          <div className="overflow-x-auto rounded-[12px] border border-[var(--line)] bg-[var(--ink2)]">
            <table className="w-full min-w-[520px] text-[11px]">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="whitespace-nowrap px-2 py-1.5 font-bold">{t("sponsors.report.day")}</th>
                  {cols.map(([l]) => <th key={l} className="whitespace-nowrap px-2 py-1.5 text-right font-bold">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.day} className="border-t border-[var(--line)] text-[var(--cream)]">
                    <td className="mono px-2 py-1">{fmtDay(d.day)}</td>
                    {cols.map(([l, k]) => <td key={l} className="mono px-2 py-1 text-right">{nf.format(num(d[k]))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {prizes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-bold text-[var(--cream)]">{t("sponsors.report.prizes")}</h2>
          {prizes.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2 text-[13px]">
              <div className="min-w-0">
                <div className="mono text-[11px] text-[var(--gold)]">{t("sponsors.report.prizeRange", { from: String(p.rank_from), to: String(p.rank_to) })}</div>
                <div className="truncate text-[var(--cream)]">{p.description_es}</div>
              </div>
              <div className="mono shrink-0 text-[11px] text-[var(--muted)]">
                {t("sponsors.report.awarded", { n: String(num(p.awarded)), q: String(num(p.quantity)) })}
              </div>
            </div>
          ))}
        </section>
      )}

      <a href={csvHref} download={`vinko-campana-${rep.id.slice(0, 8)}.csv`}
        className="rounded-[12px] border border-[var(--win)] px-4 py-2.5 text-center text-sm font-black text-[var(--win)]">
        {t("sponsors.report.csv")}
      </a>

      <p className="text-[11px] leading-snug text-[var(--muted)]">{t("sponsors.report.legal")}</p>
      <p className="mono text-[10px] text-[var(--muted2)]">{t("sponsors.report.generated", { date: fmtDate(rep.generated_at) })}</p>
    </main>
  );
}

// Serie diaria de UNA métrica: línea de 2 px, línea base, marcador del último
// día y etiqueta directa de su valor; hover por día con <title> (sin JS). El
// título nombra la serie, así que no hace falta leyenda. Si todo es 0 se dice.
function Serie({ title, days, pick }: { title: string; days: Day[]; pick: (d: Day) => number }) {
  const W = 320, H = 72, PX = 6, PY = 8;
  const vals = days.map(pick);
  const n = vals.length;
  const max = Math.max(0, ...vals);
  const x = (i: number) => (n <= 1 ? W / 2 : PX + (i / (n - 1)) * (W - 2 * PX));
  const y = (v: number) => (max <= 0 ? H - PY : H - PY - (v / max) * (H - 2 * PY));
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = n ? vals[n - 1] : 0;
  const total = vals.reduce((a, b) => a + b, 0);
  const step = n > 1 ? (W - 2 * PX) / (n - 1) : W;
  const accent = "var(--win)";
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</span>
        <span className="mono text-[12px] font-bold text-[var(--cream)]">{nf.format(total)}</span>
      </div>
      {max <= 0 && <p className="mt-1 text-[11px] text-[var(--muted)]">{t("sponsors.report.noData")}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-[72px] w-full" role="img" aria-label={title}>
        <line x1={PX} x2={W - PX} y1={H - PY} y2={H - PY} stroke="var(--line)" strokeWidth={1} />
        {n > 1 && (
          <polyline points={pts} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {n > 0 && <circle cx={x(n - 1)} cy={y(last)} r={4} fill={accent} stroke="var(--ink2)" strokeWidth={2} />}
        {days.map((d, i) => (
          <rect key={d.day} x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent">
            <title>{`${fmtDay(d.day)} · ${nf.format(pick(d))}`}</title>
          </rect>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]">
        <span className="mono">{days[0] ? fmtDay(days[0].day) : ""}</span>
        <span className="mono">{t("sponsors.report.last")}: <span className="text-[var(--cream)]">{nf.format(last)}</span></span>
      </div>
    </div>
  );
}

function NotAvailable() {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pt-6">
      <Logo mark={26} word={18} />
      <h1 className="text-xl font-black text-[var(--cream)]">{t("sponsors.report.notAvailable")}</h1>
      <p className="text-[13px] leading-relaxed text-[var(--muted)]">{t("sponsors.report.notAvailableHint")}</p>
    </main>
  );
}
