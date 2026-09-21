// Secciones de /admin/metricas. Pintan lo que devuelven las RPC kpi_* tal
// cual: 0 es 0, "—" solo cuando no hay cociente o la cohorte es demasiado
// pequeña (n<5). Estética del backstage (glass + neón + mono).
import { GlassCard, MetricCard, Eyebrow, Chip } from "@/components/backstage/ui";
import { t } from "@/lib/i18n";
import {
  fmtDec, fmtH, fmtInt, fmtPct, fmtRatio,
  type Bucket, type Economy, type EconomyWindow, type Flow, type Funnel, type KFactor, type Metrics, type Retention,
} from "@/components/admin/MetricasData";

const MONO = { fontFamily: "var(--font-mono2), monospace" } as const;
const DIM = "text-[rgba(244,241,233,0.55)]";
const LINE = "border-[rgba(244,241,233,0.1)]";
const DIVIDE = "divide-[rgba(244,241,233,0.1)]"; // literal: Tailwind no ve clases construidas

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow>{title}</Eyebrow>
      <div className="mt-3">{children}</div>
    </div>
  );
}

// ---------- Tracción ----------
export function Traccion({ m }: { m: Metrics }) {
  const d = m.dau;
  const users = d?.users ?? m.counts.users ?? 0;
  const porras = m.kfactor?.user_porras ?? m.counts.pools ?? 0;
  return (
    <Section title={t("admin.mx.traccion")}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard value={fmtInt(users)} label={t("admin.mx.users")} />
        {/* sin la RPC (0033 sin aplicar) el dato no existe: "—", no 0 */}
        <MetricCard value={d ? fmtInt(d.active_ever) : "—"} label={t("admin.mx.activeEver")} />
        <MetricCard value={fmtInt(porras)} label={t("admin.mx.userPorras")} accent="var(--gold)" />
        <MetricCard value={fmtInt(m.counts.picks)} label={t("admin.mx.picks")} accent="var(--gold)" />
        <MetricCard value={d ? fmtInt(d.dau) : "—"} label={t("admin.mx.dau")}
          spark={d?.series.map((p) => p.dau)} hint={d ? t("admin.mx.spark") : undefined} />
        <MetricCard value={d ? fmtInt(d.wau) : "—"} label={t("admin.mx.wau")} />
        <MetricCard value={d ? fmtInt(d.mau) : "—"} label={t("admin.mx.mau")} />
        <MetricCard value={d ? fmtPct(d.dau, d.mau) : "—"} label={t("admin.mx.stick")} accent="var(--gold)" />
      </div>
    </Section>
  );
}

// ---------- Retención ----------
function retCell(b: Bucket, n: number) {
  if (n < 5 || b.elig === 0) return <span className={DIM}>—</span>;
  return (
    <span>
      {fmtPct(b.n, b.elig)}{" "}
      <span className={`text-[10px] ${DIM}`}>({fmtInt(b.n)}/{fmtInt(b.elig)})</span>
    </span>
  );
}

export function Retencion({ r }: { r: Retention }) {
  const rows = r.cohorts.slice(0, 12);
  return (
    <Section title={t("admin.mx.retencion")}>
      <GlassCard glow="none">
        {rows.length === 0 ? (
          <p className={`text-[13px] ${DIM}`}>{t("admin.mx.retEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] whitespace-nowrap text-[12px]" style={MONO}>
            <thead>
              <tr className={`border-b ${LINE} text-left ${DIM}`}>
                <th className="py-2 font-normal">{t("admin.mx.col.week")}</th>
                <th className="py-2 text-right font-normal">{t("admin.mx.col.n")}</th>
                <th className="py-2 text-right font-normal">{t("admin.mx.col.d1")}</th>
                <th className="py-2 text-right font-normal">{t("admin.mx.col.d7")}</th>
                <th className="py-2 text-right font-normal">{t("admin.mx.col.d30")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.week} className={`border-b ${LINE} last:border-0`}>
                  <td className="py-2 text-[var(--cream)]">{c.week}</td>
                  <td className="py-2 text-right text-[var(--cream)]">{fmtInt(c.n)}</td>
                  <td className="py-2 text-right text-[var(--win)]">{retCell(c.d1, c.n)}</td>
                  <td className="py-2 text-right text-[var(--win)]">{retCell(c.d7, c.n)}</td>
                  <td className="py-2 text-right text-[var(--win)]">{retCell(c.d30, c.n)}</td>
                </tr>
              ))}
              <tr className={`border-t ${LINE} font-bold`}>
                <td className="py-2 text-[var(--cream)]">{t("admin.mx.total")}</td>
                <td className="py-2 text-right text-[var(--cream)]">{fmtInt(r.total.n)}</td>
                <td className="py-2 text-right text-[var(--gold)]">{retCell(r.total.d1, r.total.n)}</td>
                <td className="py-2 text-right text-[var(--gold)]">{retCell(r.total.d7, r.total.n)}</td>
                <td className="py-2 text-right text-[var(--gold)]">{retCell(r.total.d30, r.total.n)}</td>
              </tr>
            </tbody>
          </table>
          </div>
        )}
        <p className={`mt-3 text-[11px] leading-snug ${DIM}`}>{t("admin.mx.retNote")}</p>
      </GlassCard>
    </Section>
  );
}

// ---------- Embudo ----------
type Step = { label: string; n: number; of: number; sub?: string; accent?: string };

function FunnelBar({ s }: { s: Step }) {
  const w = s.of > 0 ? Math.max(0, Math.min(100, (s.n / s.of) * 100)) : 0;
  const accent = s.accent ?? "var(--win)";
  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] items-center gap-3 py-2">
      <div>
        <div className="text-[13px] text-[var(--cream)]">{s.label}</div>
        {s.sub && <div className={`text-[11px] ${DIM}`}>{s.sub}</div>}
      </div>
      <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(244,241,233,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: accent, boxShadow: `0 0 10px ${accent}88` }} />
      </div>
      <div className="min-w-[7ch] text-right text-[13px] font-bold" style={{ ...MONO, color: accent }}>
        {fmtInt(s.n)} <span className={`font-normal ${DIM}`}>· {fmtPct(s.n, s.of)}</span>
      </div>
    </div>
  );
}

export function Embudo({ f }: { f: Funnel }) {
  const med = (h: number | null) => (h == null ? undefined : t("admin.mx.median", { h: fmtDec(h, 1) }));
  const steps: Step[] = [
    { label: t("admin.mx.f.signups"), n: f.signups, of: f.signups },
    { label: t("admin.mx.f.pick"), n: f.first_pick.n, of: f.signups, sub: med(f.first_pick.median_h) },
    { label: t("admin.mx.f.created"), n: f.created.n, of: f.signups, sub: med(f.created.median_h) },
    { label: t("admin.mx.f.shared"), n: f.shared.n, of: f.signups },
    { label: t("admin.mx.f.invitee"), n: f.invitee_validated.n, of: f.signups, accent: "var(--gold)" },
    { label: t("admin.mx.f.repeat"), n: f.repeat_creator.n, of: f.repeat_creator.of,
      sub: t("admin.mx.ofCreators", { d: fmtInt(f.repeat_creator.of) }), accent: "var(--gold)" },
  ];
  return (
    <Section title={t("admin.mx.embudo")}>
      <GlassCard glow="none">
        <div className={`divide-y ${DIVIDE}`}>
          {steps.map((s) => <FunnelBar key={s.label} s={s} />)}
        </div>
      </GlassCard>
    </Section>
  );
}

// ---------- Viralidad ----------
export function Viralidad({ k }: { k: KFactor }) {
  return (
    <Section title={t("admin.mx.viralidad")}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard value={fmtRatio(k.invitees_validated, k.users, 2)} label={t("admin.mx.k")} accent="var(--gold)"
          hint={t("admin.mx.kHint", { i: fmtInt(k.invitees_validated), u: fmtInt(k.users) })} />
        <MetricCard value={fmtInt(k.inviters)} label={t("admin.mx.inviters")} />
        <MetricCard value={fmtInt(k.invitees_pending)} label={t("admin.mx.invPending")} />
        <MetricCard value={fmtRatio(k.invitees_validated, k.user_porras, 1)} label={t("admin.mx.invPerPorra")} accent="var(--gold)" />
        <MetricCard value={fmtDec(k.participants_avg, 1)} label={t("admin.mx.ppp")}
          hint={t("admin.mx.pppHint", { m: fmtDec(k.participants_median, 1), p: fmtInt(k.porras_with_participants), t: fmtInt(k.user_porras) })} />
        <MetricCard value={fmtInt(k.shares)} label={t("admin.mx.shares")}
          hint={t("admin.mx.sharesHint", { s: fmtInt(k.sharers), p: fmtInt(k.porras_shared) })} />
        <MetricCard value={fmtRatio(k.shares, k.users, 2)} label={t("admin.mx.sharesPerUser")} />
        <MetricCard value={k.time_to_share.n > 0 ? fmtH(k.time_to_share.median_h) : "—"} label={t("admin.mx.tts")} accent="var(--gold)"
          hint={t("admin.mx.ttsHint", { n: fmtInt(k.time_to_share.n) })} />
      </div>
    </Section>
  );
}

// ---------- Economía ----------
const FAUCETS = ["signup", "daily", "share", "referral", "ads", "video", "creator"];
const RETURNS = ["payout", "refund"];
const SINKS = ["picks", "store"];

function FlowRow({ k, e, group }: { k: string; e: Economy; group: keyof Pick<EconomyWindow, "faucets" | "returns" | "sinks"> }) {
  const cell = (w: EconomyWindow) => {
    const f: Flow | undefined = w[group][k];
    return f ? fmtInt(f.pts) : "0";
  };
  const method = e.all[group][k]?.method ?? "rows";
  return (
    <tr className={`border-b ${LINE} last:border-0`}>
      <td className="py-1.5 text-[var(--cream)]">{t(`admin.mx.e.${k}`)}</td>
      <td className="py-1.5 text-right">{cell(e.d7)}</td>
      <td className="py-1.5 text-right">{cell(e.d30)}</td>
      <td className="py-1.5 text-right font-bold">{cell(e.all)}</td>
      <td className="py-1.5 pl-3 text-right"><Chip tone={method === "rows" ? "win" : "muted"}>{t(`admin.mx.method.${method}`)}</Chip></td>
    </tr>
  );
}

function GroupHead({ label, tone }: { label: string; tone: string }) {
  return (
    <tr>
      <td colSpan={5} className="pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: tone }}>{label}</td>
    </tr>
  );
}

function TotalRow({ label, pick, e, tone }: { label: string; pick: (w: EconomyWindow) => number; e: Economy; tone: string }) {
  return (
    <tr className={`border-t ${LINE}`}>
      <td className="py-1.5 font-bold text-[var(--cream)]">{label}</td>
      <td className="py-1.5 text-right font-bold" style={{ color: tone }}>{fmtInt(pick(e.d7))}</td>
      <td className="py-1.5 text-right font-bold" style={{ color: tone }}>{fmtInt(pick(e.d30))}</td>
      <td className="py-1.5 text-right font-bold" style={{ color: tone }}>{fmtInt(pick(e.all))}</td>
      <td />
    </tr>
  );
}

export function Economia({ e }: { e: Economy }) {
  return (
    <Section title={t("admin.mx.economia")}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        <MetricCard value={fmtInt(e.supply)} label={t("admin.mx.supply")} accent="var(--gold)"
          hint={t("admin.mx.holders", { n: fmtInt(e.holders) })} />
        <GlassCard glow="none">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] whitespace-nowrap text-[12px]" style={MONO}>
            <thead>
              <tr className={`border-b ${LINE} text-left ${DIM}`}>
                <th className="py-2 font-normal">{t("admin.mx.col.flow")}</th>
                <th className="py-2 text-right font-normal">{t("admin.mx.col.w7")}</th>
                <th className="py-2 text-right font-normal">{t("admin.mx.col.w30")}</th>
                <th className="py-2 text-right font-normal">{t("admin.mx.col.all")}</th>
                <th className="py-2 pl-3 text-right font-normal">{t("admin.mx.col.method")}</th>
              </tr>
            </thead>
            <tbody>
              <GroupHead label={t("admin.mx.faucets")} tone="var(--win)" />
              {FAUCETS.map((k) => <FlowRow key={k} k={k} e={e} group="faucets" />)}
              <TotalRow label={t("admin.mx.faucets")} pick={(w) => w.faucets_total} e={e} tone="var(--win)" />
              <GroupHead label={t("admin.mx.returns")} tone="var(--gold)" />
              {RETURNS.map((k) => <FlowRow key={k} k={k} e={e} group="returns" />)}
              <TotalRow label={t("admin.mx.returns")} pick={(w) => w.returns_total} e={e} tone="var(--gold)" />
              <GroupHead label={t("admin.mx.sinks")} tone="var(--red)" />
              {SINKS.map((k) => <FlowRow key={k} k={k} e={e} group="sinks" />)}
              <TotalRow label={t("admin.mx.sinks")} pick={(w) => w.sinks_total} e={e} tone="var(--red)" />
              <TotalRow label={t("admin.mx.net")} pick={(w) => w.net} e={e} tone="var(--cream)" />
            </tbody>
          </table>
          </div>
          <p className={`mt-3 text-[11px] leading-snug ${DIM}`}>{t("admin.mx.notRecon")}</p>
        </GlassCard>
      </div>
    </Section>
  );
}

// ---------- Definiciones ----------
const DEFS = ["active", "dau", "ret", "funnel", "k", "ppp", "tts", "clickjoin", "economy", "excl"];

export function Definiciones() {
  return (
    <Section title={t("admin.mx.defs")}>
      <GlassCard glow="none">
        <ul className="flex flex-col gap-2">
          {DEFS.map((k) => (
            <li key={k} className={`text-[12px] leading-relaxed ${DIM}`}>
              <span className="mr-2 text-[var(--win)]" style={MONO}>·</span>{t(`admin.mx.def.${k}`)}
            </li>
          ))}
        </ul>
      </GlassCard>
    </Section>
  );
}
