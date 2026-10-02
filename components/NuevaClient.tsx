"use client";
import { ShareWhatsApp } from "@/components/ShareWhatsApp";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MediaCapture } from "@/components/MediaCapture";
import { VoiceToPorra } from "@/components/VoiceToPorra";
import { Confetti } from "@/components/Confetti";
import { capture } from "@/lib/analytics";
import { porraUrl, SITE } from "@/lib/share";
import { PushPrePrompt } from "@/components/PushPrePrompt";
import { STAKE_PRESETS, stakeTextError, stakeEmoji, type StakePresetKey } from "@/lib/reto";
import { t } from "@/lib/i18n";
import crearEs from "@/messages/parts/crear.es.json";
import {
  PLANTILLAS, PLANTILLA_LIBRE, plantilla, plantillaTextos,
  closeFromPreset, closeRangeOk, defaultResolves, maxClose, toLocalInput, MIN_CLOSE_MS,
  type ClosePreset, type PlantillaKey,
} from "@/lib/plantillas";

// Crear porra en <30 s (F-03): chips de plantilla arriba (precargan TODO) y una
// sola pantalla con scroll en 3 bloques: (1) pregunta —o dictado por voz—,
// (2) opciones 2–6, (3) cierre (15 min – 12 meses) + criterio de resolución
// OBLIGATORIO + fecha esperada del resultado. Juez, visibilidad y vídeo viven
// en "Más ajustes" (plegado: el camino rápido no los necesita). Al publicar se
// abre el share sheet nativo y, siempre, la pantalla de compartir por wa.me.
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

type ErrField = "title" | "opts" | "close" | "criteria" | "arb" | "form" | "you" | "stake";
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

const CLOSE_PRESETS: ClosePreset[] = ["1h", "tonight", "tomorrow", "week", "custom"]; // RT-02

export function NuevaClient({ userId, handle, groupId = null }: {
  userId: string;
  origin?: string;
  handle?: string | null;
  groupId?: string | null; // FX-11: /nueva?g=<id> → porra para el grupo (privada)
}) {
  const libre = plantillaTextos(PLANTILLA_LIBRE, tr);
  const [tpl, setTpl] = useState<PlantillaKey>("libre");
  const [title, setTitle] = useState("");
  const [opts, setOpts] = useState<string[]>(libre.options.length >= 2 ? libre.options : ["Sí", "No"]);
  const [preset, setPreset] = useState<ClosePreset>(PLANTILLA_LIBRE.close);
  const [custom, setCustom] = useState("");
  const [criteria, setCriteria] = useState("");
  const [resolves, setResolves] = useState("");
  const [resolvesTouched, setResolvesTouched] = useState(false);
  const [arbiter, setArbiter] = useState<"me" | "friend">("me");
  const [arbHandle, setArbHandle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">(groupId ? "private" : "public");
  const [media, setMedia] = useState<{ url: string; kind: string } | null>(null);
  const [more, setMore] = useState(false);
  // RT-02 — asistente en 2 fases: 1) pregunta + opciones; 2) tu lado («¿Tú qué
  // dices?», obligatorio salvo «Solo organizo»), qué os jugáis (SIN preselección)
  // y hasta cuándo se puede entrar.
  const [phase, setPhase] = useState<1 | 2>(1);
  const [myIdx, setMyIdx] = useState<number | null>(null);
  const [organizer, setOrganizer] = useState(false);
  const [stake, setStake] = useState<StakePresetKey | "">("");
  const [stakeCustom, setStakeCustom] = useState("");
  const [stakeVinkos, setStakeVinkos] = useState(10);   // cantidad en Vinkos
  const [whenMode, setWhenMode] = useState<"close" | "later">("close");
  const [listed, setListed] = useState(false); // FX-04: por defecto solo con enlace
  const [showDictar, setShowDictar] = useState(false);
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
    setResolvesTouched(false);
    setErr(null);
  }

  function setOpt(i: number, v: string) { setOpts((o) => o.map((x, j) => (j === i ? v : x))); setErr(null); }
  function removeOpt(i: number) { setOpts((o) => (o.length > 2 ? o.filter((_, j) => j !== i) : o)); setErr(null); }

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
    // RT-02: qué os jugáis, sin preselección: hay que elegir un chip.
    if (stake === "") { setErr({ field: "stake", msg: tr("crear.stakeRequired") }); return; }
    const stakeKindFinal: "vinkos" | "prize" = stake === "vinkos" ? "vinkos" : "prize";
    const stakeText = stake === "vinkos" ? null
      : (stake === "otro" ? stakeCustom.trim() : tr(`crear.sk.${stake}`));
    if (stakeKindFinal === "prize") {
      const bad = stakeTextError(stakeText ?? "");
      if (bad) { setErr({ field: "stake", msg: tr(`crear.stakeErr.${bad}`) }); return; }
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

    // RT-01: creación TRANSACCIONAL (porra + opciones + premio + mi pick +
    // árbitro, todo o nada). Fallback a los inserts de siempre si 0057 aún no
    // está aplicada en la base (entonces sin pick del creador ni premio).
    const rpc = await sb.rpc("create_porra", {
      p_title: title.trim(),
      p_options: clean.slice(0, 6).map((o) => o.slice(0, 40)),
      p_closes_at: close.toISOString(),
      p_my_option_idx: organizer ? null : myIdx,
      p_stake_kind: stakeKindFinal,
      p_stake_text: stakeText,
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
        if (m.includes("VINKO_STAKE_MONEY")) setErr({ field: "stake", msg: tr("crear.stakeErr.money") });
        else if (m.includes("VINKO_STAKE_LEXICON")) setErr({ field: "stake", msg: tr("crear.stakeErr.lexicon") });
        else if (m.includes("VINKO_STAKE_TEXT")) setErr({ field: "stake", msg: tr("crear.stakeErr.short") });
        else if (m.includes("VINKO_NO_USER")) setErr({ field: "arb", msg: tr("nueva.arbNotFound") });
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
    // FX-11: cuélgala del grupo (miembros la ven en /g/<id>). Nunca bloquea.
    if (groupId) {
      try { await sb.rpc("porra_set_group", { p_porra: porra.id, p_group: groupId }); } catch { /* pre-0058 */ }
    }
    capture("porra_created", {
      is_seed: false, visibility, arbiter: arbiter === "friend" ? "friend" : "me",
      template: tpl, close_preset: preset, stake: stakeKindFinal, listed,
    });
    // RT-04: el texto de WhatsApp lleva tu lado y el premio.
    const url = withRef(porraUrl(porra.slug), myHandle);
    const myOpt = organizer || myIdx === null ? null : clean[myIdx];
    const share =
      stakeKindFinal === "prize" && myOpt
        ? tr("nueva.shareReto", { emoji: stakeEmoji(stakeText), stake: stakeText ?? "", title: title.trim(), opt: myOpt, url })
        : myOpt
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
    const text = done.share; // RT-04: «Te reto a una cena… Yo digo NO…»
    const inviteText = tr("nueva.inviteText", { handle: arb, url });
    return (
      <section className="flex flex-col gap-3">
        <Confetti />
        <p className="text-center text-sm font-bold text-[var(--win)]">{tr("nueva.share")}</p>
        {warn && <p className="text-center text-xs text-[var(--gold)]">{warn}</p>}
        <ShareWhatsApp text={text} porraId={done.id}
          className="block w-full rounded-[14px] bg-[#25D366] px-4 py-4 text-center text-[15px] font-black text-white">
          {tr("nueva.shareCta")}
        </ShareWhatsApp>
        {arbiter === "friend" && arb && !warn && (
          <ShareWhatsApp text={inviteText}
            className="block w-full rounded-[14px] border border-[var(--gold)] px-4 py-3 text-center text-[14px] font-black text-[var(--gold)]">
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
  const judgeLabel = arbiter === "friend" && normHandle(arbHandle) ? `@${normHandle(arbHandle)}` : tr("crear.judgeMe");
  const summary = tr("crear.moreSummary", {
    judge: judgeLabel,
    vis: visibility === "private" ? tr("nueva.private") : tr("nueva.public"),
    media: media ? tr("crear.mediaYes") : tr("crear.mediaNone"),
  });

  const phase1Ok = title.trim().length >= 3 && opts.map((o) => o.trim()).filter(Boolean).length >= 2;

  return (
    <>
      {phase === 1 ? (
        <>
          {/* PASO 1 — PREGUNTA (+ dictado por voz) */}
          <Block n={1} title={tr("crear.step1")}>
            <input value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }} placeholder={tr("nueva.qPh")}
              aria-invalid={err?.field === "title"}
              className="w-full rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3 text-[15px] text-[var(--cream)] outline-none focus:border-[var(--win)] aria-[invalid=true]:border-[var(--red)]" />
            <ErrLine err={err} field="title" />
            {/* 4 opciones junto a la pregunta: grabar vídeo, grabar voz, subir
                archivo y dictar (rellena pregunta y opciones hablando). */}
            <Field label={tr("nueva.media")}>
              <MediaCapture userId={userId} onMedia={(url, kind) => setMedia(url && kind ? { url, kind } : null)}
                extra={
                  <button type="button" onClick={() => setShowDictar((s) => !s)} aria-pressed={showDictar}
                    className="flex flex-col items-center gap-1 rounded-[10px] border px-2 py-3 text-center"
                    style={{ borderColor: showDictar ? "var(--gold)" : "var(--line)" }}>
                    <span className="text-xl leading-none">🎙️</span>
                    <span className="text-[11px] font-bold text-[var(--cream)]">{tr("nueva.dictate")}</span>
                  </button>
                } />
              {showDictar && (
                <div className="mt-2">
                  <VoiceToPorra onFilled={(q, o) => {
                    setTitle(q);
                    setOpts(o.length >= 2 ? o.slice(0, 6) : [...o, "", ""].slice(0, 2));
                    setErr(null); setShowDictar(false);
                  }} />
                </div>
              )}
            </Field>
          </Block>

          {/* PASO 2 — OPCIONES */}
          <Block n={2} title={tr("crear.step2")}>
            <div className="flex flex-col gap-2">
              {opts.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={tr("nueva.optPh", { n: String(i + 1) })}
                    maxLength={40}
                    className="min-w-0 flex-1 rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
                  {opts.length > 2 && (
                    <button type="button" onClick={() => removeOpt(i)} aria-label={tr("crear.removeOpt", { n: String(i + 1) })}
                      className="w-10 shrink-0 rounded-[12px] border border-[var(--line)] text-lg font-bold text-[var(--muted)]">
                      ×
                    </button>
                  )}
                </div>
              ))}
              {opts.length < 6 && (
                <button type="button" onClick={() => setOpts((o) => [...o, ""])} className="self-start text-sm font-bold text-[var(--gold)]">{tr("nueva.addOpt")}</button>
              )}
            </div>
            <ErrLine err={err} field="opts" />
          </Block>

          <button type="button" onClick={() => setPhase(2)} disabled={!phase1Ok}
            className="rounded-[14px] bg-[var(--win)] px-4 py-4 text-center text-[15px] font-black text-[var(--ink)] disabled:opacity-40">
            {tr("crear.next")}
          </button>
          {!phase1Ok && <p className="text-center text-[11px] text-[var(--muted)]">{tr("crear.nextHint")}</p>}
        </>
      ) : (
        <>
          {/* PASO 3 — ¿TÚ QUÉ DICES? (RT-02: obligatorio, o «Solo organizo») */}
          <Block n={3} title={tr("crear.you")}>
            <div className="grid grid-cols-2 gap-2">
              {opts.map((o, i) => o.trim() && (
                <Chip key={i} active={!organizer && myIdx === i}
                  onClick={() => { setMyIdx(i); setOrganizer(false); setErr(null); }}>
                  {o.trim()}
                </Chip>
              ))}
            </div>
            <button type="button"
              onClick={() => { setOrganizer((v) => !v); setMyIdx(null); setErr(null); }}
              className="self-start text-[12px] font-bold underline decoration-dotted"
              style={{ color: organizer ? "var(--gold)" : "var(--muted)" }}>
              {organizer ? "✓ " : ""}{tr("crear.organizer")}
            </button>
            {organizer && <p className="text-[11px] text-[var(--muted)]">{tr("crear.organizerHint")}</p>}
            <ErrLine err={err} field="you" />
          </Block>

          {/* PASO 4 — ¿QUÉ OS JUGÁIS? (RT-02: chips SIN preselección; Dinero no existe) */}
          <Block n={4} title={tr("crear.stakeQ")}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {STAKE_PRESETS.map(({ key, emoji }) => {
                const on = stake === key;
                return (
                  <button key={key} type="button"
                    onClick={() => { setStake(key); setErr(null); }}
                    aria-pressed={on}
                    className="flex flex-col items-center justify-center gap-1 rounded-[12px] border-2 px-1 py-3 text-center text-[12px] font-black leading-tight"
                    style={{
                      borderColor: on ? "var(--gold)" : "var(--line)",
                      color: on ? "var(--gold)" : "var(--muted)",
                      background: on ? "rgba(255,194,61,0.10)" : "var(--ink2)",
                    }}>
                    <span className="text-xl leading-none">{emoji}</span>
                    {tr(`crear.sk.${key}`)}
                  </button>
                );
              })}
            </div>
            {stake === "otro" && (
              <input value={stakeCustom} onChange={(e) => { setStakeCustom(e.target.value); setErr(null); }}
                placeholder={tr("crear.sk.otroPh")} maxLength={60}
                className="w-full rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
            )}
            {stake === "vinkos" && (
              <div className="flex flex-col gap-2">
                <Field label={tr("crear.stakeAmount")}>
                  <div className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-2.5">
                    <span className="text-[15px]">🪙</span>
                    <input type="number" inputMode="numeric" min={10} max={1000} value={stakeVinkos}
                      onChange={(e) => setStakeVinkos(Math.max(10, Math.min(1000, Math.round(Number(e.target.value)))))}
                      className="w-full bg-transparent text-[15px] font-black text-[var(--cream)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                    <span className="mono text-[10px] text-[var(--muted)]">10–1000</span>
                  </div>
                </Field>
                <p className="text-[12px] text-[var(--muted)]">{tr("crear.stake.vinkosNote")}</p>
              </div>
            )}
            <ErrLine err={err} field="stake" />
          </Block>

          {/* PASO 5 — ¿HASTA CUÁNDO SE PUEDE ENTRAR? + ¿CUÁNDO SE SABE? (RT-02) */}
          <Block n={5} title={tr("crear.entryUntil")}>
            <div className="flex flex-wrap gap-2">
              {CLOSE_PRESETS.map((p) => (
                <Pill key={p} active={preset === p} onClick={() => { setPreset(p); setErr(null); }}>{tr(`crear.close.${p}`)}</Pill>
              ))}
            </div>
            {preset === "custom" && (
              <>
                <input type="datetime-local" value={custom}
                  min={toLocalInput(new Date(now.getTime() + MIN_CLOSE_MS))} max={toLocalInput(maxClose(now))}
                  onChange={(e) => { setCustom(e.target.value); setErr(null); }}
                  className="mono mt-2 w-full rounded-[10px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
                <p className="mt-1 text-[11px] text-[var(--muted)]">{tr("crear.customHint")}</p>
              </>
            )}
            {closeDate && (
              <p className="mono text-[12px] text-[var(--win)]">⏱ {tr("crear.closesAt", { date: fmtLocal(closeDate) })}</p>
            )}
            <p className="text-[11px] text-[var(--muted)]">{tr("crear.entryHelp")}</p>
            <ErrLine err={err} field="close" />

            <Field label={tr("crear.when")}>
              <div className="grid grid-cols-2 gap-2">
                <Chip active={whenMode === "close"} onClick={() => setWhenMode("close")}>{tr("crear.when.close")}</Chip>
                <Chip active={whenMode === "later"} onClick={() => setWhenMode("later")}>{tr("crear.when.later")}</Chip>
              </div>
              {whenMode === "later" && (
                <input type="datetime-local" value={resolves}
                  min={closeDate ? toLocalInput(closeDate) : undefined}
                  onChange={(e) => { setResolves(e.target.value); setResolvesTouched(true); }}
                  className="mono mt-2 w-full rounded-[10px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
              )}
            </Field>
          </Block>

      {/* MÁS AJUSTES (plegado): juez, quién la ve, vídeo/foto/voz */}      {/* MÁS AJUSTES (plegado): juez, quién la ve, vídeo/foto/voz */}
      <div className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)]/60">
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span className="flex flex-col">
            <span className="text-sm font-black text-[var(--cream)]">{tr("crear.more")}</span>
            <span className="text-[11px] text-[var(--muted)]">{summary}</span>
          </span>
          <span className="text-[var(--muted)]" aria-hidden>{more ? "▲" : "▼"}</span>
        </button>
        {more && (
          <div className="flex flex-col gap-4 border-t border-[var(--line)] px-4 pb-4 pt-3">
            {/* ÁRBITRO */}
            <Field label={tr("nueva.arbiter")}>
              <div className="grid grid-cols-2 gap-2">
                <Chip active={arbiter === "me"} onClick={() => setArbiter("me")}>{tr("nueva.arbMe")}</Chip>
                <Chip active={arbiter === "friend"} onClick={() => setArbiter("friend")}>{tr("nueva.arbFriend")}</Chip>
              </div>
              {arbiter === "friend" && (
                <>
                  <input value={arbHandle} onChange={(e) => { setArbHandle(e.target.value); setErr(null); }} placeholder={tr("nueva.arbPh")}
                    autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    className="mono mt-2 w-full rounded-[10px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{tr("nueva.arbHint")}</p>
                  <ShareWhatsApp text={tr("nueva.inviteReg", { url: withRef(`${SITE}/`, myHandle) })}
                    className="mt-2 block w-full rounded-[10px] border border-[var(--gold)] px-3 py-2 text-center text-[13px] font-bold text-[var(--gold)]">
                    {tr("nueva.inviteWa")}
                  </ShareWhatsApp>
                </>
              )}
              <ErrLine err={err} field="arb" />
            </Field>

            {/* PÚBLICA / PRIVADA */}
            <Field label={tr("nueva.visibility")}>
              <div className="grid grid-cols-2 gap-2">
                <Chip active={visibility === "public"} onClick={() => setVisibility("public")}>{tr("nueva.public")}</Chip>
                <Chip active={visibility === "private"} onClick={() => setVisibility("private")}>{tr("nueva.private")}</Chip>
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{visibility === "private" ? tr("nueva.privateHint") : tr("nueva.publicHint")}</p>
            </Field>

            {/* CRITERIO + RESULTADO ESPERADO — movidos aquí para no estorbar el
                flujo rápido de crear. Opcional: si se deja vacío, se usa uno por defecto. */}
            <Field label={tr("crear.criteria")}>
              <p className="mb-1.5 text-[13px] font-bold text-[var(--cream)]">{tr("crear.criteriaHelp")}</p>
              <textarea value={criteria} onChange={(e) => { setCriteria(e.target.value); setErr(null); }}
                placeholder={tr("crear.criteriaPh")} rows={2} maxLength={280}
                aria-invalid={err?.field === "criteria"}
                className="w-full resize-none rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3 text-sm leading-snug text-[var(--cream)] outline-none focus:border-[var(--win)] aria-[invalid=true]:border-[var(--red)]" />
              <ErrLine err={err} field="criteria" />
            </Field>

            {/* FX-04: por defecto la porra es solo-con-enlace; esto la lista en el feed */}
            <Field label={tr("crear.listed")}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />
                <span className="text-[13px] text-[var(--cream)]">{tr("crear.listed")}</span>
              </label>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{tr("crear.listedHint")}</p>
            </Field>
          </div>
        )}
      </div>

          {err && err.field !== "arb" && <p className="text-center text-xs text-[var(--red)]">{err.msg}</p>}
          {err && err.field === "arb" && !more && <p className="text-center text-xs text-[var(--red)]">{err.msg}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPhase(1)}
              className="shrink-0 rounded-[14px] border border-[var(--line)] px-4 py-4 text-[14px] font-bold text-[var(--muted)]">
              {tr("crear.back")}
            </button>
            <button onClick={create} disabled={busy}
              className="flex-1 rounded-[14px] bg-[var(--win)] px-4 py-4 text-center text-[15px] font-black text-[var(--ink)] disabled:opacity-50">
              {busy ? tr("crear.publishing") : tr("nueva.create")}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Block({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[15px] font-black text-[var(--cream)]">
        <span className="mono flex h-6 w-6 items-center justify-center rounded-full bg-[var(--win)] text-[12px] text-[var(--ink)]">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
function ErrLine({ err, field }: { err: Err | null; field: ErrField }) {
  if (!err || err.field !== field) return null;
  return <p role="alert" className="mt-1.5 text-xs font-bold text-[var(--red)]">{err.msg}</p>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-[10px] border px-3 py-2.5 text-sm font-bold"
      style={{ borderColor: active ? "var(--win)" : "var(--line)", color: active ? "var(--win)" : "var(--muted)" }}>
      {children}
    </button>
  );
}
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className="rounded-full border px-3.5 py-2 text-[13px] font-bold"
      style={{
        borderColor: active ? "var(--win)" : "var(--line)",
        color: active ? "var(--win)" : "var(--muted)",
        background: active ? "rgba(31,224,122,0.10)" : "transparent",
      }}>
      {children}
    </button>
  );
}
