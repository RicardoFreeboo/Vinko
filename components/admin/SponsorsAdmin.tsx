"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GlassCard, Chip } from "@/components/backstage/ui";
import { SponsorBadge, tSponsors as t, type SponsorshipPublic } from "@/components/SponsorBadge";

// Panel de patrocinios (M-02): alta/edición de patrocinadores y campañas,
// premios por rango de puestos, estado, enlace del informe de marca (token)
// y reparto de premios (award_prizes: SOLO ranking de Puntería). Escrituras
// por RLS de admin (0039) y RPC; aquí no se tocan Monedas ni Puntería.

export type TargetType = "porra" | "league" | "season" | "daily_gift" | "recap" | "rewarded";
export type Status = "draft" | "live" | "ended";
export type Sponsor = {
  id: string; name: string; logo_url: string | null; url: string | null;
  country: string; contact_email: string | null; created_at?: string;
};
export type Prize = {
  id: string; sponsorship_id: string; rank_from: number; rank_to: number;
  description_es: string; description_en: string | null;
  fulfillment: "code" | "manual"; quantity: number; terms_url: string | null;
  awards?: { count: number }[] | null;
};
export type Campaign = {
  id: string; sponsor_id: string; target_type: TargetType; target_id: string | null;
  starts_at: string; ends_at: string; status: Status; banner_url: string | null;
  cta_text_es: string | null; cta_text_en: string | null; cta_url: string | null;
  disclosure_label: string; budget_cents: number | null; report_token: string;
  created_at?: string; updated_at?: string;
  sponsor: { id: string; name: string; logo_url: string | null; url: string | null } | null;
  prizes: Prize[];
};
export type LeagueOpt = { id: string; week_start: string; division: string; seq: number; closed: boolean };
export type PorraInfo = { id: string; slug: string; title: string; status: string };
type Initial = { sponsors: Sponsor[]; campaigns: Campaign[]; leagues: LeagueOpt[]; porras: Record<string, PorraInfo> };

const TYPES: TargetType[] = ["porra", "league", "season", "daily_gift", "recap", "rewarded"];
const STATUSES: Status[] = ["draft", "live", "ended"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIV: Record<string, string> = { bronce: "Bronce", plata: "Plata", oro: "Oro", diamante: "Diamante", leyenda: "Leyenda" };

function fechaES(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
  }).format(d);
}
// ISO → valor de <input type="datetime-local"> en hora local del navegador.
function aLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fmtWeek = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
function leagueLabel(l: LeagueOpt): string {
  return `${t("admin.sponsors.leagueLabel", { division: DIV[l.division] ?? l.division, week: fmtWeek(l.week_start) })} #${l.seq}`;
}
const typeLabel = (tt: string) => t(`admin.sponsors.type.${tt}`);
const statusLabel = (s: string) => t(`admin.sponsors.status.${s}`);

type SponsorDraft = { name: string; logo_url: string; url: string; country: string; contact_email: string };
type PrizeDraft = {
  id?: string; rank_from: string; rank_to: string; description_es: string; description_en: string;
  fulfillment: "code" | "manual"; quantity: string; terms_url: string;
};
type CampaignDraft = {
  sponsor_id: string; target_type: TargetType; target_ref: string; target_id: string;
  starts: string; ends: string; status: Status; banner_url: string;
  cta_text_es: string; cta_text_en: string; cta_url: string; disclosure_label: string; budget: string;
  prizes: PrizeDraft[];
};

const emptySponsor = (): SponsorDraft => ({ name: "", logo_url: "", url: "", country: "ES", contact_email: "" });
const emptyPrize = (): PrizeDraft => ({
  rank_from: "1", rank_to: "1", description_es: "", description_en: "", fulfillment: "manual", quantity: "1", terms_url: "",
});
function emptyCampaign(sponsorId: string): CampaignDraft {
  const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 14 * 86400000);   // liga patrocinada: 2 semanas
  return {
    sponsor_id: sponsorId, target_type: "league", target_ref: "", target_id: "",
    starts: aLocal(start.toISOString()), ends: aLocal(end.toISOString()), status: "draft", banner_url: "",
    cta_text_es: "", cta_text_en: "", cta_url: "", disclosure_label: t("sponsors.badge.disclosure"), budget: "",
    prizes: [emptyPrize()],
  };
}
function draftFrom(c: Campaign, porras: Record<string, PorraInfo>): CampaignDraft {
  return {
    sponsor_id: c.sponsor_id, target_type: c.target_type,
    target_ref: c.target_type === "porra" ? (porras[c.target_id ?? ""]?.slug ?? c.target_id ?? "") : (c.target_id ?? ""),
    target_id: c.target_id ?? "",
    starts: aLocal(c.starts_at), ends: aLocal(c.ends_at), status: c.status,
    banner_url: c.banner_url ?? "", cta_text_es: c.cta_text_es ?? "", cta_text_en: c.cta_text_en ?? "",
    cta_url: c.cta_url ?? "", disclosure_label: c.disclosure_label ?? "",
    budget: c.budget_cents == null ? "" : String(c.budget_cents),
    prizes: c.prizes.map((p) => ({
      id: p.id, rank_from: String(p.rank_from), rank_to: String(p.rank_to),
      description_es: p.description_es, description_en: p.description_en ?? "",
      fulfillment: p.fulfillment, quantity: String(p.quantity), terms_url: p.terms_url ?? "",
    })),
  };
}

export function SponsorsAdmin({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [sponsors, setSponsors] = useState<Sponsor[]>(initial.sponsors);
  const [campaigns, setCampaigns] = useState<Campaign[]>(initial.campaigns);
  const [porras, setPorras] = useState<Record<string, PorraInfo>>(initial.porras);
  const leagues = initial.leagues;
  // tras router.refresh() llega un `initial` nuevo: se vuelve a sincronizar
  useEffect(() => { setSponsors(initial.sponsors); setCampaigns(initial.campaigns); setPorras(initial.porras); }, [initial]);

  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sponsorForm, setSponsorForm] = useState<{ id: string | null; d: SponsorDraft } | null>(null);
  const [campForm, setCampForm] = useState<{ id: string | null; d: CampaignDraft } | null>(null);

  function errorMsg(em: string): string {
    if (/does not exist|schema cache/i.test(em)) return t("admin.sponsors.pendingMigration");
    if (em.includes("VINKO_NOT_ADMIN") || /permission denied|row-level security/i.test(em)) return t("admin.sponsors.needAdmin");
    if (em.includes("VINKO_NOT_RESOLVED")) return t("admin.sponsors.notResolved");
    if (em.includes("VINKO_NOT_CLOSED")) return t("admin.sponsors.notClosed");
    if (em.includes("VINKO_BAD_TARGET")) return t("admin.sponsors.badTarget");
    return t("admin.sponsors.err");
  }
  const fallo = (e: { message?: string } | null | undefined) => setMsg({ kind: "err", text: errorMsg(String(e?.message ?? "")) });
  const sinBackend = () => setMsg({ kind: "err", text: t("admin.sponsors.needBackend") });

  // ---------- patrocinadores ----------
  async function saveSponsor() {
    if (!sponsorForm) return;
    const d = sponsorForm.d;
    const name = d.name.trim();
    const country = d.country.trim().toUpperCase();
    if (name.length < 2 || name.length > 80 || !/^[A-Z]{2}$/.test(country)) {
      setMsg({ kind: "err", text: t("admin.sponsors.badSponsor") }); return;
    }
    const sb = supabaseBrowser();
    if (!sb) { sinBackend(); return; }
    setBusy("sponsor"); setMsg(null);
    const row = {
      name, country, logo_url: d.logo_url.trim() || null, url: d.url.trim() || null,
      contact_email: d.contact_email.trim() || null,
    };
    const res = sponsorForm.id
      ? await sb.from("sponsors").update(row).eq("id", sponsorForm.id).select().single()
      : await sb.from("sponsors").insert(row).select().single();
    setBusy(null);
    if (res.error || !res.data) { fallo(res.error); return; }
    const s = res.data as Sponsor;
    setSponsors((l) => (sponsorForm.id ? l.map((x) => (x.id === s.id ? s : x)) : [...l, s]).sort((a, b) => a.name.localeCompare(b.name)));
    setSponsorForm(null);
    setMsg({ kind: "ok", text: t("admin.sponsors.saved") });
    router.refresh();
  }

  // ---------- campañas ----------
  async function lookupPorra() {
    if (!campForm) return;
    const ref = campForm.d.target_ref.trim().toLowerCase();
    if (!ref) return;
    const sb = supabaseBrowser();
    if (!sb) { sinBackend(); return; }
    setBusy("lookup"); setMsg(null);
    const q = sb.from("porras").select("id, slug, title, status");
    const { data, error } = await (UUID.test(ref) ? q.eq("id", ref) : q.eq("slug", ref)).maybeSingle();
    setBusy(null);
    if (error) { fallo(error); return; }
    if (!data) {
      setCampForm((f) => f && { ...f, d: { ...f.d, target_id: "" } });
      setMsg({ kind: "err", text: t("admin.sponsors.targetNotFound") }); return;
    }
    const p = data as PorraInfo;
    setPorras((m) => ({ ...m, [p.id]: p }));
    setCampForm((f) => f && { ...f, d: { ...f.d, target_id: p.id } });
    setMsg({ kind: "ok", text: `${t("admin.sponsors.found")}: ${p.title}` });
  }

  async function saveCampaign() {
    if (!campForm) return;
    const d = campForm.d;
    const startsTs = d.starts ? new Date(d.starts).getTime() : NaN;
    const endsTs = d.ends ? new Date(d.ends).getTime() : NaN;
    const budget = d.budget.trim() === "" ? null : Math.round(Number(d.budget));
    if (!d.sponsor_id || !TYPES.includes(d.target_type) || Number.isNaN(startsTs) || Number.isNaN(endsTs)
      || endsTs <= startsTs || (budget !== null && (Number.isNaN(budget) || budget < 0))) {
      setMsg({ kind: "err", text: t("admin.sponsors.badCampaign") }); return;
    }
    const needsTarget = d.target_type === "porra" || d.target_type === "league";
    const target_id = (d.target_type === "porra" ? d.target_id : d.target_ref).trim();
    if ((needsTarget && !UUID.test(target_id)) || (target_id && !UUID.test(target_id))) {
      setMsg({ kind: "err", text: t("admin.sponsors.needTarget") }); return;
    }
    if (d.cta_text_es.trim().length > 60 || d.cta_text_en.trim().length > 60) {
      setMsg({ kind: "err", text: t("admin.sponsors.badCta") }); return;
    }
    const prizes = d.prizes.map((p) => ({
      id: p.id, rank_from: parseInt(p.rank_from, 10), rank_to: parseInt(p.rank_to, 10),
      description_es: p.description_es.trim(), description_en: p.description_en.trim() || null,
      fulfillment: p.fulfillment, quantity: parseInt(p.quantity, 10), terms_url: p.terms_url.trim() || null,
    }));
    if (prizes.some((p) => !(p.rank_from >= 1) || !(p.rank_to >= p.rank_from)
      || p.description_es.length < 2 || p.description_es.length > 200 || !(p.quantity >= 1))) {
      setMsg({ kind: "err", text: t("admin.sponsors.badPrize") }); return;
    }
    const sb = supabaseBrowser();
    if (!sb) { sinBackend(); return; }
    setBusy("campaign"); setMsg(null);
    const row = {
      sponsor_id: d.sponsor_id, target_type: d.target_type, target_id: target_id || null,
      starts_at: new Date(startsTs).toISOString(), ends_at: new Date(endsTs).toISOString(), status: d.status,
      banner_url: d.banner_url.trim() || null,
      cta_text_es: d.cta_text_es.trim() || null, cta_text_en: d.cta_text_en.trim() || null, cta_url: d.cta_url.trim() || null,
      disclosure_label: d.disclosure_label.trim() || t("sponsors.badge.disclosure"),
      budget_cents: budget,
    };
    const res = campForm.id
      ? await sb.from("sponsorships").update(row).eq("id", campForm.id).select("id").single()
      : await sb.from("sponsorships").insert(row).select("id").single();
    if (res.error || !res.data) { setBusy(null); fallo(res.error); return; }
    const cid = (res.data as { id: string }).id;

    // premios: fuera los quitados, update los que tienen id, insert los nuevos
    let err: { message?: string } | null = null;
    const keep = new Set(prizes.filter((p) => p.id).map((p) => p.id as string));
    const gone = (campaigns.find((c) => c.id === cid)?.prizes ?? []).filter((p) => !keep.has(p.id)).map((p) => p.id);
    if (gone.length) { const { error } = await sb.from("sponsor_prizes").delete().in("id", gone); err = err ?? error; }
    for (const p of prizes) {
      const { id, ...body } = p;
      const { error } = id
        ? await sb.from("sponsor_prizes").update(body).eq("id", id)
        : await sb.from("sponsor_prizes").insert({ ...body, sponsorship_id: cid });
      err = err ?? error;
    }
    setBusy(null);
    if (err) { fallo(err); router.refresh(); return; }
    setCampForm(null);
    setMsg({ kind: "ok", text: t("admin.sponsors.saved") });
    router.refresh();
  }

  async function setStatus(c: Campaign, status: Status) {
    const sb = supabaseBrowser();
    if (!sb) { sinBackend(); return; }
    setBusy(c.id); setMsg(null);
    const { error } = await sb.from("sponsorships").update({ status }).eq("id", c.id);
    setBusy(null);
    if (error) { fallo(error); return; }
    setCampaigns((l) => l.map((x) => (x.id === c.id ? { ...x, status } : x)));
    router.refresh();
  }

  async function award(c: Campaign) {
    const sb = supabaseBrowser();
    if (!sb) { sinBackend(); return; }
    setBusy(c.id); setMsg(null);
    const { data, error } = await sb.rpc("award_prizes", { p_sponsorship: c.id });
    setBusy(null);
    if (error) { fallo(error); return; }
    const r = (data ?? {}) as { awarded_now?: number; awarded_total?: number; ranked?: number; excluded?: number };
    setMsg({ kind: "ok", text: t("admin.sponsors.awardDone", {
      n: String(r.awarded_now ?? 0), total: String(r.awarded_total ?? 0),
      ranked: String(r.ranked ?? 0), excluded: String(r.excluded ?? 0),
    }) });
    router.refresh();
  }

  async function copyReport(c: Campaign) {
    const url = `${window.location.origin}/s/${c.id}?t=${c.report_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setMsg({ kind: "ok", text: t("admin.sponsors.copied") });
    } catch {
      setMsg({ kind: "err", text: t("admin.sponsors.copyFail", { url }) });
    }
  }

  // ---------- helpers de pintado ----------
  const inWindow = (c: Campaign) => { const n = Date.now(); return Date.parse(c.starts_at) <= n && n <= Date.parse(c.ends_at); };
  function targetOf(c: Campaign): { label: string; href: string | null; state: string | null } {
    if (c.target_type === "porra") {
      const p = c.target_id ? porras[c.target_id] : null;
      if (!p) return { label: t("admin.sponsors.unknownTarget"), href: null, state: null };
      const state = p.status === "resolved" ? t("admin.sponsors.resolved") : p.status === "open" ? t("admin.sponsors.open") : p.status;
      return { label: p.title, href: `/p/${p.slug}`, state };
    }
    if (c.target_type === "league") {
      const l = leagues.find((x) => x.id === c.target_id);
      if (!l) return { label: t("admin.sponsors.unknownTarget"), href: null, state: null };
      return { label: leagueLabel(l), href: null, state: l.closed ? t("admin.sponsors.closed") : t("admin.sponsors.open") };
    }
    return { label: c.target_id ? c.target_id.slice(0, 8) : t("admin.sponsors.noTarget"), href: null, state: null };
  }
  function toPublic(c: Campaign): SponsorshipPublic {
    const sp = c.sponsor ?? sponsors.find((s) => s.id === c.sponsor_id) ?? null;
    return {
      id: c.id, target_type: c.target_type, target_id: c.target_id,
      sponsor_name: sp?.name ?? "—", sponsor_logo_url: sp?.logo_url ?? null, sponsor_url: sp?.url ?? null,
      cta_text_es: c.cta_text_es, cta_text_en: c.cta_text_en, cta_url: c.cta_url,
      disclosure_label: c.disclosure_label, banner_url: c.banner_url, starts_at: c.starts_at, ends_at: c.ends_at,
    };
  }
  const awardsOf = (c: Campaign) => c.prizes.reduce((n, p) => n + (p.awards?.[0]?.count ?? 0), 0);
  const upd = (patch: Partial<CampaignDraft>) => setCampForm((f) => f && { ...f, d: { ...f.d, ...patch } });
  const updPrize = (i: number, patch: Partial<PrizeDraft>) =>
    setCampForm((f) => f && { ...f, d: { ...f.d, prizes: f.d.prizes.map((p, j) => (j === i ? { ...p, ...patch } : p)) } });

  const input = "w-full rounded-[10px] border border-[rgba(31,224,122,0.25)] bg-[rgba(12,21,18,0.6)] px-3 py-2 text-[13px] text-[var(--cream)] outline-none focus:border-[var(--win)]";
  const lbl = "text-[11px] font-bold uppercase tracking-wide text-[rgba(244,241,233,0.5)]";
  const btnWin = "rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-50";
  const btnGold = "rounded-[10px] border border-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[var(--gold)] disabled:opacity-50";
  const btnGhost = "rounded-[10px] border border-[rgba(244,241,233,0.2)] px-3 py-1.5 text-[12px] font-bold text-[rgba(244,241,233,0.6)] disabled:opacity-40";

  function Marca({ s }: { s: Sponsor }) {
    return (
      <div className="flex items-center gap-3 rounded-[12px] border border-[rgba(31,224,122,0.18)] p-3" style={{ background: "rgba(12,21,18,0.45)" }}>
        {s.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-[8px] bg-[var(--ink3)] object-contain p-1" />
        ) : (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-[var(--ink3)] text-[13px] font-black text-[var(--win)]">
            {s.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold text-[var(--cream)]">{s.name}</span>
            <span className="mono text-[11px] text-[rgba(244,241,233,0.4)]">{s.country}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[rgba(244,241,233,0.5)]">
            {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.url}</a>}
            {s.url && s.contact_email && " · "}
            {s.contact_email}
          </div>
        </div>
        <button onClick={() => setSponsorForm({ id: s.id, d: { name: s.name, logo_url: s.logo_url ?? "", url: s.url ?? "", country: s.country, contact_email: s.contact_email ?? "" } })}
          className={btnGold}>{t("admin.sponsors.edit")}</button>
      </div>
    );
  }

  function Campana({ c }: { c: Campaign }) {
    const tg = targetOf(c);
    const ocupado = busy === c.id;
    const reparte = c.target_type === "porra" || c.target_type === "league";
    const awards = awardsOf(c);
    return (
      <GlassCard glow={c.status === "live" ? "win" : "none"}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-[var(--cream)]">{c.sponsor?.name ?? "—"}</span>
              <Chip tone="muted">{typeLabel(c.target_type)}</Chip>
              <Chip tone={c.status === "live" ? "win" : c.status === "ended" ? "muted" : "gold"}>{statusLabel(c.status)}</Chip>
              {c.status === "live" && (
                <span className={`mono text-[11px] ${inWindow(c) ? "text-[var(--win)]" : "text-[var(--red)]"}`}>
                  {inWindow(c) ? t("admin.sponsors.inWindow") : t("admin.sponsors.outWindow")}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-[var(--cream)]">
              <span className="text-[rgba(244,241,233,0.4)]">{t("admin.sponsors.fTarget")}:</span>
              {tg.href ? <Link href={tg.href} target="_blank" className="underline">{tg.label}</Link> : <span>{tg.label}</span>}
              {tg.state && <Chip tone="muted">{tg.state}</Chip>}
            </div>
            <div className="mono mt-1 text-[11px] text-[rgba(244,241,233,0.55)]">
              {fechaES(c.starts_at)} → {fechaES(c.ends_at)}
              {c.budget_cents != null && <span className="ml-3 text-[rgba(244,241,233,0.35)]">{t("admin.sponsors.fBudget")}: {c.budget_cents}</span>}
            </div>
            {c.cta_text_es && c.cta_url && (
              <div className="mt-1 truncate text-[12px] text-[rgba(244,241,233,0.6)]">
                CTA: «{c.cta_text_es}» → <a href={c.cta_url} target="_blank" rel="noopener noreferrer" className="underline">{c.cta_url}</a>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.prizes.length === 0 ? (
                <Chip tone="muted">{t("admin.sponsors.noPrizes")}</Chip>
              ) : c.prizes.map((p) => (
                <span key={p.id} className="rounded-[6px] border border-[rgba(255,194,61,0.35)] px-1.5 py-0.5 text-[11px] text-[var(--gold)]">
                  {t("admin.sponsors.prizeRange", { from: String(p.rank_from), to: String(p.rank_to) })} · {p.description_es} ×{p.quantity}
                </span>
              ))}
            </div>
            <div className="mt-1.5 text-[11px] text-[rgba(244,241,233,0.45)]">{t("admin.sponsors.awards", { n: String(awards) })}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={lbl}>{t("admin.sponsors.preview")}</span>
              <SponsorBadge s={toPublic(c)} cta />
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button onClick={() => setCampForm({ id: c.id, d: draftFrom(c, porras) })} disabled={ocupado} className={btnGold}>
              {t("admin.sponsors.edit")}
            </button>
            {c.status !== "live" && (
              <button onClick={() => setStatus(c, "live")} disabled={ocupado} className={btnWin}>{t("admin.sponsors.goLive")}</button>
            )}
            {c.status !== "ended" && (
              <button onClick={() => setStatus(c, "ended")} disabled={ocupado} className={btnGhost}>{t("admin.sponsors.end")}</button>
            )}
            {reparte && (
              <button onClick={() => award(c)} disabled={ocupado} title={t("admin.sponsors.awardHint")} className={btnWin}>
                {t("admin.sponsors.award")}
              </button>
            )}
            <Link href={`/s/${c.id}?t=${c.report_token}`} target="_blank" className={`${btnGhost} text-center`}>
              {t("admin.sponsors.report")}
            </Link>
            <button onClick={() => copyReport(c)} className={btnGhost}>{t("admin.sponsors.copyReport")}</button>
          </div>
        </div>
      </GlassCard>
    );
  }

  const d = campForm?.d;
  const sd = sponsorForm?.d;

  return (
    <>
      {msg && (
        <p className={`text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>{msg.text}</p>
      )}

      {/* PATROCINADORES */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-[var(--cream)]">{t("admin.sponsors.sponsorsHeading")}</h2>
        <div className="flex items-center gap-3">
          <span className="mono text-[12px] text-[rgba(244,241,233,0.5)]">{sponsors.length}</span>
          <button onClick={() => setSponsorForm({ id: null, d: emptySponsor() })} disabled={!!sponsorForm} className={btnWin}>
            {t("admin.sponsors.newSponsor")}
          </button>
        </div>
      </div>
      {sponsorForm && sd && (
        <GlassCard glow="gold">
          <div className="mb-3 font-bold text-[var(--cream)]">
            {sponsorForm.id ? t("admin.sponsors.editSponsor") : t("admin.sponsors.newSponsor")}
          </div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[2fr_2fr_2fr_80px_2fr]">
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fName")}</span>
              <input value={sd.name} maxLength={80} onChange={(e) => setSponsorForm((f) => f && { ...f, d: { ...f.d, name: e.target.value } })} className={input} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fLogo")}</span>
              <input value={sd.logo_url} onChange={(e) => setSponsorForm((f) => f && { ...f, d: { ...f.d, logo_url: e.target.value } })} className={input} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fUrl")}</span>
              <input value={sd.url} onChange={(e) => setSponsorForm((f) => f && { ...f, d: { ...f.d, url: e.target.value } })} className={input} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fCountry")}</span>
              <input value={sd.country} maxLength={2} onChange={(e) => setSponsorForm((f) => f && { ...f, d: { ...f.d, country: e.target.value } })} className={`${input} mono uppercase`} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fEmail")}</span>
              <input value={sd.contact_email} type="email" onChange={(e) => setSponsorForm((f) => f && { ...f, d: { ...f.d, contact_email: e.target.value } })} className={input} /></label>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={saveSponsor} disabled={busy === "sponsor"} className={btnWin}>{t("admin.sponsors.save")}</button>
            <button onClick={() => setSponsorForm(null)} disabled={busy === "sponsor"} className={btnGhost}>{t("admin.sponsors.cancel")}</button>
          </div>
        </GlassCard>
      )}
      {sponsors.length === 0 ? (
        <GlassCard glow="none"><p className="text-sm text-[rgba(244,241,233,0.5)]">{t("admin.sponsors.emptySponsors")}</p></GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{sponsors.map((s) => <Marca key={s.id} s={s} />)}</div>
      )}

      {/* CAMPAÑAS */}
      <div className="mt-2 flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-[var(--cream)]">{t("admin.sponsors.campaignsHeading")}</h2>
        <div className="flex items-center gap-3">
          <span className="mono text-[12px] text-[rgba(244,241,233,0.5)]">{campaigns.length}</span>
          <button onClick={() => setCampForm({ id: null, d: emptyCampaign(sponsors[0]?.id ?? "") })}
            disabled={!!campForm || sponsors.length === 0} className={btnWin}>
            {t("admin.sponsors.newCampaign")}
          </button>
        </div>
      </div>

      {campForm && d && (
        <GlassCard glow="gold">
          <div className="mb-3 font-bold text-[var(--cream)]">
            {campForm.id ? t("admin.sponsors.editCampaign") : t("admin.sponsors.newCampaign")}
          </div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fSponsor")}</span>
              <select value={d.sponsor_id} onChange={(e) => upd({ sponsor_id: e.target.value })} className={input}>
                {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fTargetType")}</span>
              <select value={d.target_type} onChange={(e) => upd({ target_type: e.target.value as TargetType, target_ref: "", target_id: "" })} className={input}>
                {TYPES.map((tt) => <option key={tt} value={tt}>{typeLabel(tt)}</option>)}
              </select></label>
            {d.target_type === "porra" ? (
              <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fTargetPorra")}</span>
                <div className="flex gap-2">
                  <input value={d.target_ref} onChange={(e) => upd({ target_ref: e.target.value, target_id: "" })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupPorra(); } }} className={`${input} mono`} />
                  <button type="button" onClick={lookupPorra} disabled={busy === "lookup"} className={btnGold}>{t("admin.sponsors.lookup")}</button>
                </div>
                {d.target_id && porras[d.target_id] && (
                  <span className="text-[11px] text-[var(--win)]">{t("admin.sponsors.found")}: {porras[d.target_id].title}</span>
                )}
              </label>
            ) : d.target_type === "league" ? (
              <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fTargetLeague")}</span>
                {leagues.length === 0 ? (
                  <span className="text-[12px] text-[rgba(244,241,233,0.5)]">{t("admin.sponsors.noLeagues")}</span>
                ) : (
                  <select value={d.target_ref} onChange={(e) => upd({ target_ref: e.target.value })} className={input}>
                    <option value="">—</option>
                    {leagues.map((l) => (
                      <option key={l.id} value={l.id}>{leagueLabel(l)} · {l.closed ? t("admin.sponsors.closed") : t("admin.sponsors.open")}</option>
                    ))}
                  </select>
                )}
              </label>
            ) : (
              <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fTargetOther")}</span>
                <input value={d.target_ref} onChange={(e) => upd({ target_ref: e.target.value })} className={`${input} mono`} /></label>
            )}
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fStarts")}</span>
              <input type="datetime-local" value={d.starts} onChange={(e) => upd({ starts: e.target.value })} className={`${input} mono`} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fEnds")}</span>
              <input type="datetime-local" value={d.ends} onChange={(e) => upd({ ends: e.target.value })} className={`${input} mono`} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fStatus")}</span>
              <select value={d.status} onChange={(e) => upd({ status: e.target.value as Status })} className={input}>
                {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fCtaEs")}</span>
              <input value={d.cta_text_es} maxLength={60} onChange={(e) => upd({ cta_text_es: e.target.value })} className={input} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fCtaEn")}</span>
              <input value={d.cta_text_en} maxLength={60} onChange={(e) => upd({ cta_text_en: e.target.value })} className={input} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fCtaUrl")}</span>
              <input value={d.cta_url} onChange={(e) => upd({ cta_url: e.target.value })} className={input} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fBanner")}</span>
              <input value={d.banner_url} onChange={(e) => upd({ banner_url: e.target.value })} className={input} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fDisclosure")}</span>
              <input value={d.disclosure_label} maxLength={40} onChange={(e) => upd({ disclosure_label: e.target.value })} className={input} /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.fBudget")}</span>
              <input value={d.budget} inputMode="numeric" onChange={(e) => upd({ budget: e.target.value })} className={`${input} mono`} /></label>
          </div>

          {/* premios por rango de puestos */}
          <div className="mt-4 flex items-baseline justify-between">
            <span className="font-bold text-[var(--cream)]">{t("admin.sponsors.prizes")}</span>
            <button type="button" onClick={() => upd({ prizes: [...d.prizes, emptyPrize()] })} className={btnGold}>{t("admin.sponsors.addPrize")}</button>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-[rgba(244,241,233,0.4)]">{t("admin.sponsors.prizesHint")}</p>
          <div className="mt-2 flex flex-col gap-2">
            {d.prizes.map((p, i) => (
              <div key={p.id ?? `n${i}`} className="grid grid-cols-2 gap-2 rounded-[10px] border border-[rgba(244,241,233,0.08)] p-2 md:grid-cols-[70px_70px_2fr_2fr_100px_70px_2fr_auto]">
                <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.pRankFrom")}</span>
                  <input value={p.rank_from} inputMode="numeric" onChange={(e) => updPrize(i, { rank_from: e.target.value })} className={`${input} mono`} /></label>
                <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.pRankTo")}</span>
                  <input value={p.rank_to} inputMode="numeric" onChange={(e) => updPrize(i, { rank_to: e.target.value })} className={`${input} mono`} /></label>
                <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.pDescEs")}</span>
                  <input value={p.description_es} maxLength={200} onChange={(e) => updPrize(i, { description_es: e.target.value })} className={input} /></label>
                <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.pDescEn")}</span>
                  <input value={p.description_en} maxLength={200} onChange={(e) => updPrize(i, { description_en: e.target.value })} className={input} /></label>
                <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.pFulfillment")}</span>
                  <select value={p.fulfillment} onChange={(e) => updPrize(i, { fulfillment: e.target.value as "code" | "manual" })} className={input}>
                    <option value="manual">{t("admin.sponsors.fulfillment.manual")}</option>
                    <option value="code">{t("admin.sponsors.fulfillment.code")}</option>
                  </select></label>
                <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.pQuantity")}</span>
                  <input value={p.quantity} inputMode="numeric" onChange={(e) => updPrize(i, { quantity: e.target.value })} className={`${input} mono`} /></label>
                <label className="flex flex-col gap-1"><span className={lbl}>{t("admin.sponsors.pTerms")}</span>
                  <input value={p.terms_url} onChange={(e) => updPrize(i, { terms_url: e.target.value })} className={input} /></label>
                <div className="flex items-end">
                  <button type="button" onClick={() => upd({ prizes: d.prizes.filter((_, j) => j !== i) })} className={btnGhost}>{t("admin.sponsors.removePrize")}</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={saveCampaign} disabled={busy === "campaign"} className={btnWin}>{t("admin.sponsors.save")}</button>
            <button onClick={() => setCampForm(null)} disabled={busy === "campaign"} className={btnGhost}>{t("admin.sponsors.cancel")}</button>
          </div>
        </GlassCard>
      )}

      {campaigns.length === 0 ? (
        <GlassCard glow="none"><p className="text-sm text-[rgba(244,241,233,0.5)]">{t("admin.sponsors.emptyCampaigns")}</p></GlassCard>
      ) : (
        <div className="flex flex-col gap-3">{campaigns.map((c) => <Campana key={c.id} c={c} />)}</div>
      )}
    </>
  );
}
