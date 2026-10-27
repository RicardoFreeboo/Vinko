"use client";
import { ShareWhatsApp } from "@/components/ShareWhatsApp";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Mic, Paperclip, Pencil, Plus, Send, Sparkles, Users, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MediaCapture } from "@/components/MediaCapture";
import { VoiceToPorra } from "@/components/VoiceToPorra";
import { Confetti } from "@/components/Confetti";
import { optionAccent, optionLetter } from "@/components/vote/VoteOption";
import { capture } from "@/lib/analytics";
import { porraUrl, SITE } from "@/lib/share";
import { PushPrePrompt } from "@/components/PushPrePrompt";
import { t } from "@/lib/i18n";
import crearEs from "@/messages/parts/crear.es.json";
import {
  PLANTILLAS, plantilla, plantillaTextos,
  closeFromPreset, closeRangeOk, defaultResolves, maxClose, toLocalInput, MIN_CLOSE_MS,
  type ClosePreset, type PlantillaKey,
} from "@/lib/plantillas";

// CREAR (VINKO_PANTALLAS 06) en una sola pantalla: plantillas arriba (precargan
// pregunta, opciones, cierre y criterio), la PREGUNTA en grande (o dictada por
// voz, con vídeo/foto), las opciones A/B…, tu voto, cuándo CIERRA, «Cómo se
// resuelve» (sugerido por la plantilla, editable), PARA quién (un grupo tuyo,
// quien tenga el enlace o todo Vinko) y «Crear y mandar». Juez y «¿cuándo se
// sabe?» en «Más ajustes». Al publicar: share sheet nativo y pantalla de wa.me.
//
// Sin «qué os jugáis»: en modo solo-puntos toda predicción es de Vinkos
// (REGLAS-LEGALES §3; create_porra ignora p_stake_* desde 0061).
//
// Todo enlace que sale de aquí lleva ?ref=<tu handle>: RefCatcher lo guarda y
// /auth/callback lo convierte en referred_by. Los Vinkos de la invitación se
// pagan a los dos en el primer pick del invitado (servidor, 0030).
function slugify(title: string): string {
  const base = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const rnd = Math.random().toString(36).slice(2, 6);
  return ((base.length >= 3 ? base : "porra") + "-" + rnd).slice(0, 80);
}

// @Usuario → usuario (lo que espera set_arbiter: handle en minúsculas, sin @).
const HANDLE_RX = /^[a-z0-9_]{3,30}$/;
function normHandle(s: string): string {
  return s.trim().replace(/^@+/, "").trim().toLowerCase();
}

// Claves crear.* aún sin fusionar en es.json (scripts/i18n-merge.mjs): t()
// devuelve la propia clave si falta → se toma del part. Tras la fusión manda t().
const PART = crearEs as Record<string, string>;
function tr(key: string, vars?: Record<string, string>): string {
  const v = t(key, vars);
  if (v !== key || !(key in PART)) return v;
  return Object.entries(vars ?? {}).reduce((s, [k, val]) => s.replaceAll(`{${k}}`, val), PART[key]);
}

// Añade ?ref=<handle> a un enlace (respeta una query previa).
function withRef(url: string, handle: string | null | undefined): string {
  if (!handle) return url;
  return `${url}${url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(handle)}`;
}

// "vie 25 sep, 23:59" en la hora local del móvil.
function fmtLocal(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

type ErrField = "title" | "opts" | "close" | "criteria" | "arb" | "form" | "you";
type Err = { field: ErrField; msg: string };

// Errores del trigger 0041 (y del guard de seguridad 0020) → mensaje en línea.
function dbErr(message: string | undefined): Err {
  const m = message ?? "";
  if (m.includes("VINKO_CRITERIA")) return { field: "criteria", msg: tr("crear.errCriteria") };
  if (m.includes("VINKO_CLOSE_RANGE")) return { field: "close", msg: tr("crear.errCloseRange") };
  if (m.includes("VINKO_UNSAFE")) return { field: "title", msg: tr("crear.errUnsafe") };
  return { field: "form", msg: tr("crear.errGeneric") };
}

// Share sheet nativo (Android/iOS). false si no existe, se cancela o el
// navegador lo niega por falta de gesto: queda el botón wa.me de siempre.
async function nativeShare(title: string, text: string, url: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  try {
    await navigator.share({ title, text, url });
    capture("porra_shared", { is_seed: false, via: "native" });
    return true;
  } catch { return false; }
}

// Los tres cierres del diseño; si una plantilla trae otro (1 h, mañana, 1
// semana), se pinta delante y seleccionado.
const CLOSE_PILLS: ClosePreset[] = ["tonight", "weekend", "custom"];
const PILL_KEY: Partial<Record<ClosePreset, string>> = {
  tonight: "nueva06.closeTonight", weekend: "nueva06.closeWeekend", custom: "nueva06.closeCustom",
};

// «Para»: un grupo tuyo (privada, colgada del grupo), quien tenga el enlace
// (pública sin listar) o todo Vinko (pública y en Descubrir).
type Target = { kind: "group"; id: string; name: string } | { kind: "link" } | { kind: "feed" };

export function NuevaClient({ userId, handle, groupId = null, groups = [] }: {
  userId: string;
  handle?: string | null;
  groupId?: string | null; // FX-11: /nueva?g=<id> → para ese grupo
  groups?: { id: string; name: string }[];
}) {
  // Arranca con la primera plantilla («¿Quién…?»), como el diseño.
  const first = PLANTILLAS[0];
  const start = plantillaTextos(first, tr);
  const [tpl, setTpl] = useState<PlantillaKey>(first.key);
  const [title, setTitle] = useState(start.question);
  const [opts, setOpts] = useState<string[]>(start.options.length >= 2 ? start.options : ["Sí", "No"]);
  const [preset, setPreset] = useState<ClosePreset>(first.close);
  const [custom, setCustom] = useState("");
  const [criteria, setCriteria] = useState(start.criteria);
  const [editCrit, setEditCrit] = useState(false);
  const [resolves, setResolves] = useState("");
  const [resolvesTouched, setResolvesTouched] = useState(false);
  const [whenMode, setWhenMode] = useState<"close" | "later">("close");
  const [arbiter, setArbiter] = useState<"me" | "friend">("me");
  const [arbHandle, setArbHandle] = useState("");
  const initial: Target = (() => {
    const g = groups.find((x) => x.id === groupId) ?? (groupId ? null : groups[0]);
    return g ? { kind: "group", id: g.id, name: g.name } : { kind: "link" };
  })();
  const [target, setTarget] = useState<Target>(initial);
  const [pickTarget, setPickTarget] = useState(false);
  const [media, setMedia] = useState<{ url: string; kind: string } | null>(null);
  const [tool, setTool] = useState<"none" | "dictate" | "media">("none");
  const [more, setMore] = useState(false);
  const [myIdx, setMyIdx] = useState<number | null>(null);
  const [organizer, setOrganizer] = useState(false);
  const [err, setErr] = useState<Err | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; slug: string; share: string } | null>(null);
  const [myHandle, setMyHandle] = useState<string | null>(handle ?? null);

  // Si la página no pasa el handle, se lee del perfil (para el ?ref= del enlace).
  useEffect(() => {
    if (myHandle) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    void sb.from("profiles").select("handle").eq("id", userId).maybeSingle()
      .then(({ data }) => { if (data?.handle) setMyHandle(data.handle); });
  }, [myHandle, userId]);

  const closeDate = useMemo(() => closeFromPreset(preset, custom), [preset, custom]);

  // La fecha esperada del resultado sigue al cierre hasta que el usuario la toque.
  useEffect(() => {
    if (resolvesTouched) return;
    setResolves(closeDate ? toLocalInput(defaultResolves(closeDate, plantilla(tpl))) : "");
  }, [closeDate, tpl, resolvesTouched]);

  function applyTemplate(key: PlantillaKey) {
    const p = plantilla(key);
    const tx = plantillaTextos(p, tr);
    setTpl(key);
    setTitle(tx.question);
    setOpts(tx.options.length >= 2 ? tx.options.slice(0, 6) : ["", ""]);
    setPreset(p.close);
    setCustom("");
    setCriteria(tx.criteria);
    setEditCrit(false);
    setMyIdx(null);
    setResolvesTouched(false);
    setErr(null);
  }

  function setOpt(i: number, v: string) { setOpts((o) => o.map((x, j) => (j === i ? v : x))); setErr(null); }
  function removeOpt(i: number) {
    setOpts((o) => (o.length > 2 ? o.filter((_, j) => j !== i) : o));
    setMyIdx((m) => (m === null ? m : m === i ? null : m > i ? m - 1 : m));
    setErr(null);
  }

  async function create() {
    const clean = opts.map((o) => o.trim()).filter(Boolean);
    const crit = criteria.trim();
    const arb = normHandle(arbHandle);
    if (title.trim().length < 5 || title.trim().length > 120) { setErr({ field: "title", msg: tr("nueva.badTitle") }); return; }
    if (clean.length < 2) { setErr({ field: "opts", msg: tr("nueva.badOpts") }); return; }
    if (preset === "custom" && !custom) { setErr({ field: "close", msg: tr("nueva.badDate") }); return; }
    const close = closeFromPreset(preset, custom);
    if (!close || !closeRangeOk(close)) { setErr({ field: "close", msg: tr("crear.errCloseRange") }); return; }
    // RT-02: tu lado es obligatorio (o marcas que solo organizas, modo juez).
    if (!organizer && (myIdx === null || myIdx >= clean.length)) {
      setErr({ field: "you", msg: tr("crear.youRequired") }); return;
    }
    const critFinal = (crit.length >= 5 ? crit : tr("crear.criteriaDefault")).slice(0, 280);
    if (arbiter === "friend" && !arb) { setErr({ field: "arb", msg: tr("nueva.badArb") }); return; }
    if (arbiter === "friend" && !HANDLE_RX.test(arb)) { setErr({ field: "arb", msg: tr("nueva.arbNotFound") }); return; }
    if (arbiter === "friend" && myHandle && arb === myHandle.toLowerCase()) { setErr({ field: "arb", msg: tr("nueva.arbSelf") }); return; }
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null); setWarn(null);

    // El árbitro se comprueba ANTES de crear: si no existe, no se crea nada.
    if (arbiter === "friend") {
      const { data: found } = await sb.from("profiles").select("id").eq("handle", arb).maybeSingle();
      if (!found) { setBusy(false); setErr({ field: "arb", msg: tr("nueva.arbNotFound") }); return; }
    }

    // RT-02: «¿Cuándo se sabe?» — al cerrar, o más adelante (nunca antes del cierre).
    const resolvesDate = whenMode === "later" && resolves ? new Date(resolves) : close;
    const resolvesAt = Number.isNaN(resolvesDate.getTime()) || resolvesDate < close ? close : resolvesDate;
    const visibility = target.kind === "group" ? "private" : "public";
    const listed = target.kind === "feed";

    // RT-01: creación TRANSACCIONAL (porra + opciones + mi pick + árbitro, todo
    // o nada). Fallback a los inserts de siempre si 0057 aún no está aplicada.
    const rpc = await sb.rpc("create_porra", {
      p_title: title.trim(),
      p_options: clean.slice(0, 6).map((o) => o.slice(0, 40)),
      p_closes_at: close.toISOString(),
      p_my_option_idx: organizer ? null : myIdx,
      p_resolves_at: resolvesAt.toISOString(),
      p_criteria: critFinal,
      p_arbiter_handle: arbiter === "friend" ? arb : null,
      p_visibility: visibility,
      p_template_key: tpl,
      p_media_url: media?.url ?? null,
      p_media_kind: media?.kind ?? null,
      p_listed: listed,
    });
    let porra: { id: string; slug: string } | null =
      rpc.error ? null : (rpc.data as { id: string; slug: string });
    if (rpc.error) {
      const m = rpc.error.message ?? "";
      const missing = rpc.error.code === "PGRST202" || rpc.error.code === "42883";
      if (!missing) {
        setBusy(false);
        if (m.includes("VINKO_NO_USER")) setErr({ field: "arb", msg: tr("nueva.arbNotFound") });
        else if (m.includes("VINKO_NO_POINTS")) setErr({ field: "you", msg: tr("pick.noPoints") });
        else setErr(dbErr(m));
        return;
      }
      // Legacy (pre-0057): inserts de siempre.
      const slug = slugify(title);
      const base = {
        slug, title: title.trim(), created_by: userId, closes_at: close.toISOString(),
        visibility,
        media_url: media?.url ?? null,
        media_kind: media?.kind ?? null,
        video_status: media ? "pending" : "none",
      };
      let res = await sb.from("porras")
        .insert({ ...base, resolution_criteria: critFinal, resolves_at: resolvesAt.toISOString(), template_key: tpl })
        .select("id, slug").single();
      if (res.error?.code === "PGRST204") {
        res = await sb.from("porras").insert(base).select("id, slug").single();
      }
      if (res.error || !res.data) { setBusy(false); setErr(dbErr(res.error?.message)); return; }
      porra = res.data;
      const rows = clean.slice(0, 6).map((label, idx) => ({ porra_id: porra!.id, idx, label: label.slice(0, 40) }));
      const { error: e2 } = await sb.from("porra_options").insert(rows);
      if (e2) { setBusy(false); setErr({ field: "opts", msg: tr("nueva.badOpts") }); return; }
      if (arbiter === "friend") {
        const { error: e3 } = await sb.rpc("set_arbiter", { p_porra: porra.id, p_handle: arb });
        if (e3) setWarn(tr("nueva.arbFailed"));
      }
    }
    if (!porra) { setBusy(false); setErr(dbErr(undefined)); return; }
    // FX-11: cuélgala del grupo (miembros la ven en /g/<id> y en su inicio). Nunca bloquea.
    if (target.kind === "group") {
      try { await sb.rpc("porra_set_group", { p_porra: porra.id, p_group: target.id }); } catch { /* pre-0058 */ }
    }
    capture("porra_created", {
      is_seed: false, visibility, arbiter: arbiter === "friend" ? "friend" : "me",
      template: tpl, close_preset: preset, target: target.kind, listed,
    });
    // RT-04: el texto de WhatsApp lleva tu lado.
    const url = withRef(porraUrl(porra.slug), myHandle);
    const myOpt = organizer || myIdx === null ? null : clean[myIdx];
    const share = myOpt
      ? tr("nueva.sharePick", { opt: myOpt, url })
      : tr("nueva.shareText", { title: title.trim(), url });
    setBusy(false);
    setDone({ id: porra.id, slug: porra.slug, share });
    // Share sheet automático al publicar (F-03): mismo tick que el clic.
    void nativeShare(title.trim(), share, url);
  }

  if (done) {
    const url = withRef(porraUrl(done.slug), myHandle);
    const arb = normHandle(arbHandle);
    const inviteText = tr("nueva.inviteText", { handle: arb, url });
    return (
      <section className="flex flex-col gap-3">
        <Confetti />
        <p className="text-center text-[18px] font-black text-[var(--win)]">{tr("nueva.share")}</p>
        {warn && <p className="text-center text-xs text-[var(--gold)]">{warn}</p>}
        <ShareWhatsApp text={done.share} porraId={done.id}
          className="flex h-14 w-full items-center justify-center rounded-full bg-[#25D366] px-4 text-center text-[16px] font-black text-white">
          {tr("nueva.shareCta")}
        </ShareWhatsApp>
        {arbiter === "friend" && arb && !warn && (
          <ShareWhatsApp text={inviteText}
            className="flex h-12 w-full items-center justify-center rounded-full border border-[var(--gold)] px-4 text-center text-[14px] font-black text-[var(--gold)]">
            {tr("nueva.inviteArb")}
          </ShareWhatsApp>
        )}
        <p className="mono break-all text-center text-[11px] text-[var(--muted)]">{url}</p>
        <PushPrePrompt hasValue />
        <Link href={`/p/${done.slug}`} className="text-center text-sm font-bold text-[var(--gold)]">{tr("nueva.view")}</Link>
      </section>
    );
  }

  const now = new Date();
  const pills: ClosePreset[] = CLOSE_PILLS.includes(preset) ? CLOSE_PILLS : [preset, ...CLOSE_PILLS];
  const named = opts.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  const critShown = criteria.trim() || tr("crear.criteriaDefault");
  const targetLabel = target.kind === "group" ? target.name : target.kind === "feed" ? tr("nueva06.forFeed") : tr("nueva06.forLink");
  const targets: Target[] = [
    ...groups.map((g) => ({ kind: "group" as const, id: g.id, name: g.name })),
    { kind: "link" }, { kind: "feed" },
  ];
  const sameTarget = (a: Target, b: Target) => a.kind === b.kind && (a.kind !== "group" || (b.kind === "group" && a.id === b.id));

  return (
    <>
      {/* plantillas (precargan todo) */}
      <div className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none]">
        {PLANTILLAS.map((p) => {
          const on = tpl === p.key;
          return (
            <button key={p.key} type="button" onClick={() => applyTemplate(p.key)} aria-pressed={on}
              className="mono flex h-11 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 text-[12px] font-bold uppercase tracking-[0.1em]"
              style={on
                ? { borderColor: "var(--win)", color: "var(--win)", background: "rgba(31,224,122,0.10)" }
                : { borderColor: "var(--line2)", color: "var(--cream)", background: "var(--ink2)" }}>
              <span aria-hidden className="text-[16px] leading-none">{p.emoji}</span>{tr(`crear.tpl.${p.key}`)}
            </button>
          );
        })}
      </div>

      {/* PREGUNTA */}
      <section className="rounded-[20px] border-[1.5px] bg-[var(--ink2)] p-4"
        style={{ borderColor: err?.field === "title" ? "var(--red)" : "rgba(31,224,122,0.8)" }}>
        <label htmlFor="q" className="eyebrow text-[11.5px] font-bold">{tr("nueva06.question")}</label>
        <textarea id="q" value={title} rows={2} maxLength={120}
          onChange={(e) => { setTitle(e.target.value); setErr(null); }}
          placeholder={tpl === "quien" ? tr("crear.tpl.quien.ph") : tr("nueva06.qPh")}
          className="mt-2 w-full resize-none bg-transparent text-[26px] font-black leading-[1.12] tracking-[-0.03em] text-[var(--cream)] outline-none placeholder:text-[var(--muted2)]" />
        <div className="mt-1 flex gap-2">
          <ToolButton on={tool === "dictate"} onClick={() => setTool((x) => (x === "dictate" ? "none" : "dictate"))} icon={<Mic size={15} aria-hidden />}>
            {tr("nueva06.toolDictate")}
          </ToolButton>
          <ToolButton on={tool === "media" || !!media} onClick={() => setTool((x) => (x === "media" ? "none" : "media"))} icon={<Paperclip size={15} aria-hidden />}>
            {tr("nueva06.toolMedia")}
          </ToolButton>
        </div>
        {tool === "dictate" && (
          <div className="mt-3">
            <VoiceToPorra onFilled={(q, o) => {
              setTitle(q);
              setOpts(o.length >= 2 ? o.slice(0, 6) : [...o, "", ""].slice(0, 2));
              setMyIdx(null); setErr(null); setTool("none");
            }} />
          </div>
        )}
        {(tool === "media" || media) && (
          <div className={tool === "media" ? "mt-3" : "hidden"}>
            <MediaCapture userId={userId} onMedia={(url, kind) => setMedia(url && kind ? { url, kind } : null)} />
          </div>
        )}
      </section>
      <ErrLine err={err} field="title" />

      {/* OPCIONES */}
      <section className="flex flex-col gap-2.5">
        {opts.map((o, i) => (
          <div key={i} className="flex h-[58px] items-center gap-3 rounded-[16px] border-[1.5px] border-[var(--line)] bg-[var(--ink2)] px-4">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full border-2 font-black"
              style={{ borderColor: optionAccent(i), color: optionAccent(i), fontFamily: "var(--mono)", fontSize: 14 }}>
              {optionLetter(i)}
            </span>
            <input value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={tr("nueva.optPh", { n: String(i + 1) })}
              maxLength={40} aria-label={tr("nueva.optPh", { n: String(i + 1) })}
              className="min-w-0 flex-1 bg-transparent text-[17px] font-bold text-[var(--cream)] outline-none placeholder:font-semibold placeholder:text-[var(--muted2)]" />
            {opts.length > 2 ? (
              <button type="button" onClick={() => removeOpt(i)} aria-label={tr("crear.removeOpt", { n: String(i + 1) })}
                className="grid h-8 w-8 place-items-center text-[var(--muted)]"><X size={18} /></button>
            ) : (
              <Pencil size={18} aria-hidden className="shrink-0 text-[var(--muted2)]" />
            )}
          </div>
        ))}
        {opts.length < 6 && (
          <button type="button" onClick={() => setOpts((o) => [...o, ""])}
            className="flex items-center gap-2 self-start px-1 py-1 text-[15px] font-semibold text-[var(--muted)]">
            <Plus size={18} aria-hidden /> {tr("nueva06.addOpt")}
          </button>
        )}
        <ErrLine err={err} field="opts" />
      </section>

      {/* TU VOTO (RT-02: obligatorio, o «Solo organizo») */}
      {named.length >= 2 && (
        <section className="flex flex-col gap-2">
          <p className="eyebrow text-[11.5px] font-bold">{tr("crear.you")}</p>
          <div className="flex flex-wrap gap-2">
            {named.map(({ o, i }) => {
              const on = !organizer && myIdx === i;
              return (
                <button key={i} type="button" aria-pressed={on}
                  onClick={() => { setMyIdx(i); setOrganizer(false); setErr(null); }}
                  className="flex h-10 max-w-full items-center gap-2 rounded-full border-[1.5px] px-3.5 text-[14px] font-bold"
                  style={on
                    ? { borderColor: "var(--win)", color: "var(--ink)", background: "var(--win)" }
                    : { borderColor: "var(--line2)", color: "var(--cream)", background: "var(--ink2)" }}>
                  <span className="mono text-[12px]">{optionLetter(i)}</span><span className="truncate">{o}</span>
                </button>
              );
            })}
          </div>
          <button type="button"
            onClick={() => { setOrganizer((v) => !v); setMyIdx(null); setErr(null); }}
            className="self-start text-[13px] font-semibold underline decoration-dotted underline-offset-2"
            style={{ color: organizer ? "var(--gold)" : "var(--muted)" }}>
            {organizer ? "✓ " : ""}{tr("crear.organizer")}
          </button>
          {organizer && <p className="text-[12px] text-[var(--muted)]">{tr("crear.organizerHint")}</p>}
          <ErrLine err={err} field="you" />
        </section>
      )}

      {/* CIERRA */}
      <section className="flex flex-col gap-2">
        <p className="eyebrow text-[11.5px] font-bold">{tr("nueva06.closes")}</p>
        <div className="grid grid-cols-3 gap-2" style={pills.length > 3 ? { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" } : undefined}>
          {pills.map((p) => {
            const on = preset === p;
            return (
              <button key={p} type="button" aria-pressed={on} onClick={() => { setPreset(p); setErr(null); }}
                className="mono min-h-11 rounded-full border-[1.5px] px-2 py-1.5 text-[12px] font-bold uppercase leading-tight tracking-[0.08em]"
                style={on
                  ? { borderColor: "var(--cream)", color: "var(--ink)", background: "var(--cream)" }
                  : { borderColor: "var(--line2)", color: "var(--cream)", background: "var(--ink2)" }}>
                {tr(PILL_KEY[p] ?? `crear.close.${p}`)}
              </button>
            );
          })}
        </div>
        {preset === "custom" && (
          <>
            <input type="datetime-local" value={custom} aria-label={tr("nueva06.closeCustom")}
              min={toLocalInput(new Date(now.getTime() + MIN_CLOSE_MS))} max={toLocalInput(maxClose(now))}
              onChange={(e) => { setCustom(e.target.value); setErr(null); }}
              className="mono w-full rounded-[13px] border-[1.5px] border-[var(--line2)] bg-[var(--ink3)] px-3.5 py-3 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
            <p className="text-[12px] text-[var(--muted)]">{tr("crear.customHint")}</p>
          </>
        )}
        {closeDate && <p className="mono text-[12px] text-[var(--win)]">⏱ {tr("crear.closesAt", { date: fmtLocal(closeDate) })}</p>}
        <ErrLine err={err} field="close" />
      </section>

      {/* CÓMO SE RESUELVE (sugerido por la plantilla; editable) */}
      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-4">
        <div className="flex items-center gap-2 text-[15px] font-bold text-[var(--win)]">
          <Sparkles size={17} aria-hidden /> {tr("nueva06.how")} · {tr("nueva06.suggested")}
          <span className="flex-1" />
          {!editCrit && (
            <button type="button" onClick={() => setEditCrit(true)} className="text-[13px] font-semibold text-[var(--muted)]">
              {tr("nueva06.edit")}
            </button>
          )}
        </div>
        {editCrit ? (
          <textarea value={criteria} autoFocus rows={3} maxLength={280}
            onChange={(e) => { setCriteria(e.target.value); setErr(null); }} placeholder={tr("crear.criteriaPh")}
            aria-invalid={err?.field === "criteria"}
            className="mt-2 w-full resize-none rounded-[13px] border-[1.5px] border-[var(--line2)] bg-[var(--ink3)] px-3.5 py-3 text-[15px] leading-snug text-[var(--cream)] outline-none focus:border-[var(--win)] aria-[invalid=true]:border-[var(--red)]" />
        ) : (
          <p className="mt-1.5 text-[15.5px] leading-snug text-[var(--cream)]">{critShown}</p>
        )}
        <ErrLine err={err} field="criteria" />
      </section>

      {/* PARA */}
      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--ink2)]">
        <button type="button" onClick={() => setPickTarget((v) => !v)} aria-expanded={pickTarget}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <Users size={20} aria-hidden className="shrink-0 text-[var(--muted)]" />
          <span className="min-w-0 flex-1 truncate text-[16px] text-[var(--cream)]">
            {tr("nueva06.for")} <b>{targetLabel}</b>
          </span>
          <span className="text-[14px] text-[var(--muted)]">{tr("nueva06.change")}</span>
        </button>
        {pickTarget && (
          <div className="flex flex-col border-t border-[var(--line)] p-2">
            {targets.map((x, k) => {
              const on = sameTarget(x, target);
              return (
                <button key={k} type="button" onClick={() => { setTarget(x); setPickTarget(false); }}
                  className="rounded-[12px] px-3 py-2.5 text-left text-[15px]"
                  style={{ color: on ? "var(--win)" : "var(--cream)", background: on ? "rgba(31,224,122,0.08)" : "transparent" }}>
                  {x.kind === "group" ? x.name : x.kind === "feed" ? tr("nueva06.forFeed") : tr("nueva06.forLink")}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* MÁS AJUSTES (plegado): juez y cuándo se sabe */}
      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--ink2)]/60">
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span className="text-[14px] font-bold text-[var(--cream)]">{tr("crear.more")}</span>
          <span className="text-[var(--muted)]" aria-hidden>{more ? "▲" : "▼"}</span>
        </button>
        {more && (
          <div className="flex flex-col gap-4 border-t border-[var(--line)] px-4 pb-4 pt-3">
            <Field label={tr("nueva.arbiter")}>
              <div className="grid grid-cols-2 gap-2">
                <Chip active={arbiter === "me"} onClick={() => setArbiter("me")}>{tr("nueva.arbMe")}</Chip>
                <Chip active={arbiter === "friend"} onClick={() => setArbiter("friend")}>{tr("nueva.arbFriend")}</Chip>
              </div>
              {arbiter === "friend" && (
                <>
                  <input value={arbHandle} onChange={(e) => { setArbHandle(e.target.value); setErr(null); }} placeholder={tr("nueva.arbPh")}
                    autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    className="mono mt-2 w-full rounded-[12px] border-[1.5px] border-[var(--line2)] bg-[var(--ink3)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{tr("nueva.arbHint")}</p>
                  <ShareWhatsApp text={tr("nueva.inviteReg", { url: withRef(`${SITE}/`, myHandle) })}
                    className="mt-2 block w-full rounded-full border border-[var(--gold)] px-3 py-2 text-center text-[13px] font-bold text-[var(--gold)]">
                    {tr("nueva.inviteWa")}
                  </ShareWhatsApp>
                </>
              )}
              <ErrLine err={err} field="arb" />
            </Field>
            <Field label={tr("crear.when")}>
              <div className="grid grid-cols-2 gap-2">
                <Chip active={whenMode === "close"} onClick={() => setWhenMode("close")}>{tr("crear.when.close")}</Chip>
                <Chip active={whenMode === "later"} onClick={() => setWhenMode("later")}>{tr("crear.when.later")}</Chip>
              </div>
              {whenMode === "later" && (
                <input type="datetime-local" value={resolves} aria-label={tr("crear.when")}
                  min={closeDate ? toLocalInput(closeDate) : undefined}
                  onChange={(e) => { setResolves(e.target.value); setResolvesTouched(true); }}
                  className="mono mt-2 w-full rounded-[12px] border-[1.5px] border-[var(--line2)] bg-[var(--ink3)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
              )}
            </Field>
          </div>
        )}
      </section>

      {err && !["title", "opts", "you", "close", "criteria", "arb"].includes(err.field) && (
        <p role="alert" className="text-center text-xs font-bold text-[var(--red)]">{err.msg}</p>
      )}
      {err?.field === "arb" && !more && <p role="alert" className="text-center text-xs font-bold text-[var(--red)]">{err.msg}</p>}

      <button type="button" onClick={create} disabled={busy}
        className="mt-1 flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-[var(--win)] px-4 text-[17px] font-black text-[var(--ink)] disabled:opacity-60"
        style={{ boxShadow: "0 5px 0 var(--windeep), 0 10px 26px -8px rgba(31,224,122,0.45)" }}>
        <Send size={20} strokeWidth={2.4} aria-hidden />
        {busy ? tr("crear.publishing") : target.kind === "group" ? tr("nueva06.ctaGroup") : tr("nueva06.cta")}
      </button>
    </>
  );
}

function ToolButton({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className="flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold"
      style={{ borderColor: on ? "var(--win)" : "var(--line2)", color: on ? "var(--win)" : "var(--muted)" }}>
      {icon}{children}
    </button>
  );
}
function ErrLine({ err, field }: { err: Err | null; field: ErrField }) {
  if (!err || err.field !== field) return null;
  return <p role="alert" className="-mt-1 text-xs font-bold text-[var(--red)]">{err.msg}</p>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className="rounded-full border-[1.5px] px-3 py-2.5 text-sm font-bold"
      style={{ borderColor: active ? "var(--win)" : "var(--line2)", color: active ? "var(--win)" : "var(--muted)" }}>
      {children}
    </button>
  );
}
