"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GlassCard, Chip } from "@/components/backstage/ui";
import { tMoney as t, moneyErr } from "@/components/admin/MoneyI18n";
import type { PoolStatus } from "@/components/admin/MoneyAdmin";

// Bolsas y fuente oficial (M0). Flujo: 1) alta de la fuente oficial de
// resultados, 2) asignarla a una porra editorial (queda elegible), 3) adjuntar
// la bolsa con el proveedor (POST /api/admin/money/pools), 4) fijar el resultado
// desde la fuente y liquidar. El juez humano nunca decide una porra con bolsa:
// solo la fuente oficial (results_feed).

// Misma expresión regular que la migración 0045 (results_feed.key).
const KEY_RE = /^[a-z0-9_]+:[a-z0-9_]+:[A-Za-z0-9_-]+$/;

export type FeedRow = {
  key: string; provider: string; label: string; event_at: string;
  options_count: number; result_option_idx: number | null; source_url: string | null; resolved_at: string | null;
};
export type EditorialPorra = {
  id: string; slug: string; title: string; closes_at: string;
  options_count: number; resolution_source_ref: string | null; money_eligible: boolean; has_pool: boolean;
};
export type PoolRow = {
  id: string; porra_id: string; porra_slug: string; porra_title: string;
  country: string; provider: string; status: PoolStatus; external_pool_id: string | null;
  currency: string; stake_minor: number; rake_bps: number; closes_at: string;
  confirmed: number; result_option_idx: number | null;
};
export type AttachCountry = { iso: string; currency: string | null; stakes_minor: number[] };
export type PoolsData = {
  feed: FeedRow[]; editorial: EditorialPorra[]; pools: PoolRow[];
  attachCountries: AttachCountry[]; rakeBpsDefault: number; backend: boolean;
};

const input = "w-full rounded-[10px] border border-[rgba(31,224,122,0.25)] bg-[rgba(12,21,18,0.6)] px-3 py-2 text-[13px] text-[var(--cream)] outline-none focus:border-[var(--win)]";
const lbl = "text-[11px] font-bold uppercase tracking-wide text-[rgba(244,241,233,0.5)]";
const btnWin = "rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-50";
const btnGold = "rounded-[10px] border border-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[var(--gold)] disabled:opacity-50";
const btnGhost = "rounded-[10px] border border-[rgba(244,241,233,0.2)] px-3 py-1.5 text-[12px] font-bold text-[rgba(244,241,233,0.6)] disabled:opacity-40";
const btnRed = "rounded-[10px] border border-[var(--red)] px-3 py-1.5 text-[12px] font-black text-[var(--red)] disabled:opacity-50";

function fechaES(iso: string | null | undefined): string {
  if (!iso) return t("adminMoney.dash");
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return t("adminMoney.dash");
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(dt);
}
function aLocal(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
}
function fmtMoney(minor: number, currency: string | null): string {
  const cur = currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
  const major = minor / 100;
  try {
    return cur ? new Intl.NumberFormat("es-ES", { style: "currency", currency: cur }).format(major) : `${major.toFixed(2)} (${minor})`;
  } catch { return `${major.toFixed(2)} (${minor})`; }
}

type FeedDraft = { key: string; provider: string; label: string; event_at: string; options_count: string; source_url: string };
function emptyFeed(): FeedDraft {
  const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 24);
  return { key: "", provider: "manual", label: "", event_at: aLocal(d.toISOString()), options_count: "2", source_url: "" };
}

export function MoneyPoolsAdmin({ initial }: { initial: PoolsData }) {
  const router = useRouter();
  const [data, setData] = useState<PoolsData>(initial);
  useEffect(() => { setData(initial); }, [initial]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [feedForm, setFeedForm] = useState<{ editing: boolean; d: FeedDraft } | null>(null);
  const [resultSel, setResultSel] = useState<Record<string, string>>({});
  const [srcSel, setSrcSel] = useState<Record<string, string>>({});
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const ok = (text: string) => setMsg({ kind: "ok", text });
  const fail = (m: string) => setMsg({ kind: "err", text: moneyErr(m) });
  const noBackend = () => setMsg({ kind: "err", text: t("adminMoney.err.no_backend") });

  // ---------- fuente oficial ----------
  async function saveFeed() {
    if (!feedForm) return;
    const d = feedForm.d;
    const key = d.key.trim();
    if (!KEY_RE.test(key)) { setMsg({ kind: "err", text: t("adminMoney.feed.badKey") }); return; }
    const oc = parseInt(d.options_count, 10);
    const evTs = d.event_at ? new Date(d.event_at).getTime() : NaN;
    if (!d.provider.trim() || d.label.trim().length < 2 || Number.isNaN(evTs) || !(oc >= 2 && oc <= 6)) {
      setMsg({ kind: "err", text: t("adminMoney.feed.badForm") }); return;
    }
    const sb = supabaseBrowser();
    if (!sb) { noBackend(); return; }
    setBusy("feed"); setMsg(null);
    const { error } = await sb.rpc("results_feed_upsert", {
      p_key: key, p_provider: d.provider.trim(), p_label: d.label.trim(),
      p_event_at: new Date(evTs).toISOString(), p_options_count: oc, p_source_url: d.source_url.trim() || null,
    });
    setBusy(null);
    if (error) { fail(error.message); return; }
    setFeedForm(null); ok(t("adminMoney.feed.saved")); router.refresh();
  }

  async function setResult(f: FeedRow) {
    const raw = resultSel[f.key];
    if (raw == null || raw === "") return;
    const idx = parseInt(raw, 10);
    const sb = supabaseBrowser();
    if (!sb) { noBackend(); return; }
    setBusy("res:" + f.key); setMsg(null);
    const { error } = await sb.rpc("results_feed_set_result", { p_key: f.key, p_idx: idx, p_source_url: f.source_url ?? null });
    setBusy(null);
    if (error) { fail(error.message); return; }
    ok(t("adminMoney.feed.resultSet", { key: f.key, n: String(idx + 1) })); router.refresh();
  }

  // ---------- fuente ↔ porra ----------
  async function setSource(p: EditorialPorra, key: string | null) {
    const sb = supabaseBrowser();
    if (!sb) { noBackend(); return; }
    setBusy("src:" + p.id); setMsg(null);
    const { error } = await sb.rpc("money_admin_set_source", { p_porra: p.id, p_key: key });
    setBusy(null);
    if (error) { fail(error.message); return; }
    ok(t(key ? "adminMoney.editorial.sourceSet" : "adminMoney.editorial.sourceRemoved")); router.refresh();
  }

  // ---------- bolsas ----------
  async function attach(porraId: string, country: string, stakeMinor: number, rakeBps: number) {
    setBusy("attach:" + porraId); setMsg(null);
    const res = await fetch("/api/admin/money/pools", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ porraId, country, stakeMinor, rakeBps }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { fail(String(j?.error ?? "")); return; }
    ok(t("adminMoney.attach.done", { id: String(j?.poolId ?? "") })); router.refresh();
  }

  async function closePool(p: PoolRow) {
    const sb = supabaseBrowser();
    if (!sb) { noBackend(); return; }
    setBusy(p.id); setMsg(null);
    const { error } = await sb.rpc("money_pool_ref_set_status", { p_pool: p.id, p_status: "closed" });
    setBusy(null);
    if (error) { fail(error.message); return; }
    ok(t("adminMoney.act.closed")); router.refresh();
  }

  async function settlePool(p: PoolRow) {
    setBusy(p.id); setMsg(null);
    const res = await fetch(`/api/admin/money/pools/${p.id}/settle`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { fail(String(j?.error ?? "")); return; }
    ok(t("adminMoney.act.settleSent")); router.refresh();
  }

  async function voidPool(p: PoolRow) {
    setBusy(p.id); setMsg(null);
    const res = await fetch(`/api/admin/money/pools/${p.id}/void`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: voidReason.trim() || "void" }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { fail(String(j?.error ?? "")); return; }
    setVoidFor(null); setVoidReason(""); ok(t("adminMoney.act.voided")); router.refresh();
  }

  const th = "px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-[rgba(244,241,233,0.45)]";
  const td = "px-2 py-1.5 text-[13px] text-[var(--cream)] align-top";
  const attachCandidates = data.editorial.filter((p) => p.money_eligible && !p.has_pool);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold text-[var(--cream)]">{t("adminMoney.pools.title")}</h2>
        <p className="mt-1 max-w-[80ch] text-[12px] leading-relaxed text-[rgba(244,241,233,0.5)]">{t("adminMoney.pools.how")}</p>
      </div>
      {msg && <p className={`text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>{msg.text}</p>}

      {/* 1) FUENTE OFICIAL */}
      <GlassCard glow="none">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="font-bold text-[var(--cream)]">{t("adminMoney.feed.title")}</span>
          <button onClick={() => setFeedForm({ editing: false, d: emptyFeed() })} disabled={!!feedForm} className={btnWin}>{t("adminMoney.feed.new")}</button>
        </div>
        <p className="mb-3 text-[11px] leading-snug text-[rgba(244,241,233,0.45)]">{t("adminMoney.feed.how")}</p>

        {feedForm && (
          <div className="mb-4 rounded-[12px] border border-[rgba(255,194,61,0.25)] p-3">
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.feed.key")}</span>
                <input value={feedForm.d.key} readOnly={feedForm.editing} onChange={(e) => setFeedForm((f) => f && { ...f, d: { ...f.d, key: e.target.value } })}
                  className={`${input} mono ${feedForm.editing ? "opacity-60" : ""}`} /></label>
              <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.feed.provider")}</span>
                <input value={feedForm.d.provider} onChange={(e) => setFeedForm((f) => f && { ...f, d: { ...f.d, provider: e.target.value } })} className={`${input} mono`} /></label>
              <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.feed.optionsCount")}</span>
                <input value={feedForm.d.options_count} inputMode="numeric" onChange={(e) => setFeedForm((f) => f && { ...f, d: { ...f.d, options_count: e.target.value } })} className={`${input} mono`} /></label>
              <label className="flex flex-col gap-1 md:col-span-2"><span className={lbl}>{t("adminMoney.feed.label")}</span>
                <input value={feedForm.d.label} maxLength={120} onChange={(e) => setFeedForm((f) => f && { ...f, d: { ...f.d, label: e.target.value } })} className={input} /></label>
              <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.feed.eventAt")}</span>
                <input type="datetime-local" value={feedForm.d.event_at} onChange={(e) => setFeedForm((f) => f && { ...f, d: { ...f.d, event_at: e.target.value } })} className={`${input} mono`} /></label>
              <label className="flex flex-col gap-1 md:col-span-3"><span className={lbl}>{t("adminMoney.feed.sourceUrl")}</span>
                <input value={feedForm.d.source_url} onChange={(e) => setFeedForm((f) => f && { ...f, d: { ...f.d, source_url: e.target.value } })} className={input} /></label>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={saveFeed} disabled={busy === "feed"} className={btnWin}>{t("adminMoney.feed.save")}</button>
              <button onClick={() => setFeedForm(null)} disabled={busy === "feed"} className={btnGhost}>{t("adminMoney.cancel")}</button>
            </div>
          </div>
        )}

        {data.feed.length === 0 ? (
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("adminMoney.feed.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-[rgba(244,241,233,0.1)]">
                <th className={th}>{t("adminMoney.feed.key")}</th>
                <th className={th}>{t("adminMoney.feed.label")}</th>
                <th className={th}>{t("adminMoney.feed.eventAt")}</th>
                <th className={th}>{t("adminMoney.feed.optionsCount")}</th>
                <th className={th}>{t("adminMoney.feed.result")}</th>
                <th className={th} />
              </tr></thead>
              <tbody>
                {data.feed.map((f) => (
                  <tr key={f.key} className="border-b border-[rgba(244,241,233,0.06)]">
                    <td className={`${td} mono text-[11px] break-all`}>{f.key}</td>
                    <td className={td}>{f.label}</td>
                    <td className={`${td} mono text-[11px]`}>{fechaES(f.event_at)}</td>
                    <td className={`${td} mono`}>{f.options_count}</td>
                    <td className={td}>
                      {f.result_option_idx != null
                        ? <Chip tone="win">{t("adminMoney.feed.option", { n: String(f.result_option_idx + 1) })} · {t("adminMoney.feed.resolvedAt")} {fechaES(f.resolved_at)}</Chip>
                        : <Chip tone="muted">{t("adminMoney.feed.noResult")}</Chip>}
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-1.5">
                        <select value={resultSel[f.key] ?? ""} onChange={(e) => setResultSel((m) => ({ ...m, [f.key]: e.target.value }))}
                          className={`${input} mono w-auto py-1`}>
                          <option value="">{t("adminMoney.feed.setResult")}</option>
                          {Array.from({ length: f.options_count }, (_, i) => (
                            <option key={i} value={String(i)}>{t("adminMoney.feed.option", { n: String(i + 1) })}</option>
                          ))}
                        </select>
                        <button onClick={() => setResult(f)} disabled={busy === "res:" + f.key || !resultSel[f.key]} className={btnGold}>{t("adminMoney.feed.setResult")}</button>
                        <button onClick={() => setFeedForm({ editing: true, d: { key: f.key, provider: f.provider, label: f.label, event_at: aLocal(f.event_at), options_count: String(f.options_count), source_url: f.source_url ?? "" } })}
                          className={btnGhost}>{t("adminMoney.feed.edit")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* 2) PORRAS EDITORIALES ↔ FUENTE */}
      <GlassCard glow="none">
        <div className="mb-1 font-bold text-[var(--cream)]">{t("adminMoney.editorial.title")}</div>
        <p className="mb-3 text-[11px] leading-snug text-[rgba(244,241,233,0.45)]">{t("adminMoney.editorial.how")}</p>
        {data.editorial.length === 0 ? (
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("adminMoney.editorial.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.editorial.map((p) => {
              const compatible = data.feed.filter((f) => f.options_count === p.options_count);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[rgba(244,241,233,0.08)] p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/p/${p.slug}`} target="_blank" className="truncate font-bold text-[var(--cream)] underline">{p.title}</Link>
                      <Chip tone="muted">{t("adminMoney.editorial.optionsN", { n: String(p.options_count) })}</Chip>
                      {p.money_eligible && <Chip tone="win">{t("adminMoney.editorial.eligible")}</Chip>}
                      {p.has_pool && <Chip tone="gold">{t("adminMoney.editorial.hasPool")}</Chip>}
                    </div>
                    <div className="mono mt-1 text-[11px] text-[rgba(244,241,233,0.5)]">
                      {t("adminMoney.editorial.closes")} {fechaES(p.closes_at)}
                      {p.resolution_source_ref && <span className="ml-2 text-[var(--gold)]">· {p.resolution_source_ref}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select value={srcSel[p.id] ?? p.resolution_source_ref ?? ""} onChange={(e) => setSrcSel((m) => ({ ...m, [p.id]: e.target.value }))} className={`${input} mono w-auto py-1`}>
                      <option value="">{t("adminMoney.editorial.none")}</option>
                      {compatible.map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}
                    </select>
                    <button onClick={() => setSource(p, (srcSel[p.id] ?? "") || null)} disabled={busy === "src:" + p.id} className={btnGold}>{t("adminMoney.editorial.apply")}</button>
                    {p.resolution_source_ref && (
                      <button onClick={() => setSource(p, null)} disabled={busy === "src:" + p.id || p.has_pool} className={btnGhost}>{t("adminMoney.editorial.remove")}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* 3) ADJUNTAR BOLSA */}
      <GlassCard glow="none">
        <div className="mb-1 font-bold text-[var(--cream)]">{t("adminMoney.attach.title")}</div>
        <p className="mb-3 text-[11px] leading-snug text-[rgba(244,241,233,0.45)]">{t("adminMoney.attach.how")}</p>
        {data.attachCountries.length === 0 ? (
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("adminMoney.attach.noCountries")}</p>
        ) : attachCandidates.length === 0 ? (
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("adminMoney.attach.noPorras")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {attachCandidates.map((p) => (
              <AttachRow key={p.id} porra={p} countries={data.attachCountries} rakeDefault={data.rakeBpsDefault}
                busy={busy === "attach:" + p.id} onSubmit={attach} />
            ))}
          </div>
        )}
      </GlassCard>

      {/* 4) BOLSAS */}
      <GlassCard glow="none">
        <div className="mb-3 font-bold text-[var(--cream)]">{t("adminMoney.list.title")}</div>
        {data.pools.length === 0 ? (
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("adminMoney.list.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-[rgba(244,241,233,0.1)]">
                <th className={th}>{t("adminMoney.col.porra")}</th>
                <th className={th}>{t("adminMoney.col.country")}</th>
                <th className={th}>{t("adminMoney.col.provider")}</th>
                <th className={th}>{t("adminMoney.col.status")}</th>
                <th className={th}>{t("adminMoney.col.entry")}</th>
                <th className={th}>{t("adminMoney.col.fee")}</th>
                <th className={th}>{t("adminMoney.col.external")}</th>
                <th className={th}>{t("adminMoney.col.confirmed")}</th>
                <th className={th}>{t("adminMoney.col.closes")}</th>
                <th className={th} />
              </tr></thead>
              <tbody>
                {data.pools.map((p) => {
                  const b = busy === p.id;
                  const canClose = p.status === "open";
                  const canSettle = (p.status === "open" || p.status === "closed") && p.result_option_idx != null;
                  const canVoid = p.status === "draft" || p.status === "open" || p.status === "closed";
                  return (
                    <tr key={p.id} className="border-b border-[rgba(244,241,233,0.06)]">
                      <td className={td}>
                        {p.porra_slug
                          ? <Link href={`/p/${p.porra_slug}`} target="_blank" className="underline">{p.porra_title}</Link>
                          : <span>{p.porra_title}</span>}
                      </td>
                      <td className={`${td} mono`}>{p.country}</td>
                      <td className={`${td} mono text-[11px]`}>{p.provider}</td>
                      <td className={td}><Chip tone={p.status === "open" ? "win" : p.status === "settled" ? "gold" : "muted"}>{t(`adminMoney.status.${p.status}`)}</Chip></td>
                      <td className={`${td} mono`}>{fmtMoney(p.stake_minor, p.currency)}</td>
                      <td className={`${td} mono`}>{p.rake_bps}</td>
                      <td className={`${td} mono text-[11px] break-all`}>{p.external_pool_id ?? t("adminMoney.dash")}</td>
                      <td className={`${td} mono`}>{p.confirmed}</td>
                      <td className={`${td} mono text-[11px]`}>{fechaES(p.closes_at)}</td>
                      <td className={td}>
                        <div className="flex flex-col gap-1.5">
                          <span className={`text-[10px] ${p.result_option_idx != null ? "text-[var(--win)]" : "text-[rgba(244,241,233,0.4)]"}`}>
                            {p.result_option_idx != null ? t("adminMoney.act.resultReady", { n: String(p.result_option_idx + 1) }) : t("adminMoney.act.resultMissing")}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {canClose && <button onClick={() => closePool(p)} disabled={b} className={btnGhost}>{t("adminMoney.act.close")}</button>}
                            {canSettle && <button onClick={() => settlePool(p)} disabled={b} title={t("adminMoney.act.settleHint")} className={btnWin}>{t("adminMoney.act.settle")}</button>}
                            {canVoid && <button onClick={() => { setVoidFor(voidFor === p.id ? null : p.id); setVoidReason(""); }} disabled={b} className={btnRed}>{t("adminMoney.act.void")}</button>}
                          </div>
                          {voidFor === p.id && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder={t("adminMoney.act.voidReason")} className={`${input} w-auto py-1`} />
                              <button onClick={() => voidPool(p)} disabled={b} className={btnRed}>{t("adminMoney.act.confirmVoid")}</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function AttachRow({ porra, countries, rakeDefault, busy, onSubmit }: {
  porra: EditorialPorra; countries: AttachCountry[]; rakeDefault: number; busy: boolean;
  onSubmit: (porraId: string, country: string, stakeMinor: number, rakeBps: number) => void;
}) {
  const [country, setCountry] = useState(countries[0]?.iso ?? "");
  const cc = countries.find((c) => c.iso === country) ?? countries[0];
  const stakes = cc?.stakes_minor ?? [];
  const [stake, setStake] = useState(String(stakes[0] ?? ""));
  const [rake, setRake] = useState(String(rakeDefault));
  useEffect(() => { setStake(String((countries.find((c) => c.iso === country)?.stakes_minor ?? [])[0] ?? "")); }, [country, countries]);

  const stakeN = parseInt(stake, 10);
  const rakeN = parseInt(rake, 10);
  const valid = /^[A-Z]{2}$/.test(country) && Number.isInteger(stakeN) && stakeN > 0 && Number.isInteger(rakeN) && rakeN >= 0 && rakeN <= 2000;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-[rgba(244,241,233,0.08)] p-2.5">
      <div className="min-w-0 flex-1">
        <Link href={`/p/${porra.slug}`} target="_blank" className="truncate font-bold text-[var(--cream)] underline">{porra.title}</Link>
        <div className="mono mt-1 text-[11px] text-[rgba(244,241,233,0.5)]">{t("adminMoney.editorial.optionsN", { n: String(porra.options_count) })} · {porra.resolution_source_ref}</div>
      </div>
      <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.attach.country")}</span>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={`${input} mono w-auto py-1`}>
          {countries.map((c) => <option key={c.iso} value={c.iso}>{c.iso}</option>)}
        </select></label>
      <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.attach.stake")}</span>
        {stakes.length ? (
          <select value={stake} onChange={(e) => setStake(e.target.value)} className={`${input} mono w-auto py-1`}>
            {stakes.map((s) => <option key={s} value={String(s)}>{fmtMoney(s, cc?.currency ?? null)}</option>)}
          </select>
        ) : <span className="text-[12px] text-[var(--red)]">{t("adminMoney.attach.noStakes")}</span>}
      </label>
      <label className="flex flex-col gap-1"><span className={lbl}>{t("adminMoney.attach.rake")}</span>
        <input value={rake} inputMode="numeric" onChange={(e) => setRake(e.target.value)} className={`${input} mono w-24 py-1`} /></label>
      <button onClick={() => onSubmit(porra.id, country, stakeN, rakeN)} disabled={busy || !valid} className={btnWin}>{t("adminMoney.attach.submit")}</button>
    </div>
  );
}
