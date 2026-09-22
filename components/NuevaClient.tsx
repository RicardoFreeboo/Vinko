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

type ErrField = "title" | "opts" | "close" | "criteria" | "arb" | "form";
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

const CLOSE_PRESETS: ClosePreset[] = ["1h", "tonight", "tomorrow", "weekend", "custom"];

export function NuevaClient({ userId, handle }: { userId: string; origin?: string; handle?: string | null }) {
  const libre = plantillaTextos(PLANTILLA_LIBRE, tr);
  const [tpl, setTpl] = useState<PlantillaKey>("libre");
  const [title, setTitle] = useState("");
  const [opts, setOpts] = useState<string[]>(libre.options.length >= 2 ? libre.options : ["", ""]);
  const [preset, setPreset] = useState<ClosePreset>(PLANTILLA_LIBRE.close);
  const [custom, setCustom] = useState("");
  const [criteria, setCriteria] = useState("");
  const [resolves, setResolves] = useState("");
  const [resolvesTouched, setResolvesTouched] = useState(false);
  const [arbiter, setArbiter] = useState<"me" | "friend">("me");
  const [arbHandle, setArbHandle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [media, setMedia] = useState<{ url: string; kind: string } | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<Err | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; slug: string } | null>(null);
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
    if (crit.length < 5) { setErr({ field: "criteria", msg: tr("crear.errCriteria") }); return; }
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

    // Resolución esperada: nunca antes del cierre (el trigger también lo corrige).
    const resolvesDate = resolves ? new Date(resolves) : close;
    const resolvesAt = Number.isNaN(resolvesDate.getTime()) || resolvesDate < close ? close : resolvesDate;

    const slug = slugify(title);
    const base = {
      slug, title: title.trim(), created_by: userId, closes_at: close.toISOString(),
      visibility,
      media_url: media?.url ?? null,
      media_kind: media?.kind ?? null,
      video_status: media ? "pending" : "none",
    };
    let res = await sb.from("porras")
      .insert({ ...base, resolution_criteria: crit.slice(0, 280), resolves_at: resolvesAt.toISOString(), template_key: tpl })
      .select("id, slug").single();
    if (res.error?.code === "PGRST204") { // 0041 aún sin aplicar: sin las columnas nuevas
      res = await sb.from("porras").insert(base).select("id, slug").single();
    }
    const { data: porra, error } = res;
    if (error || !porra) { setBusy(false); setErr(dbErr(error?.message)); return; }
    const rows = clean.slice(0, 6).map((label, idx) => ({ porra_id: porra.id, idx, label: label.slice(0, 40) }));
    const { error: e2 } = await sb.from("porra_options").insert(rows);
    if (e2) { setBusy(false); setErr({ field: "opts", msg: tr("nueva.badOpts") }); return; }
    if (arbiter === "friend") {
      // La porra ya existe: si esto falla, el juez eres tú y se avisa (sin duplicar porras).
      const { error: e3 } = await sb.rpc("set_arbiter", { p_porra: porra.id, p_handle: arb });
      if (e3) setWarn(tr("nueva.arbFailed"));
    }
    capture("porra_created", {
      is_seed: false, visibility, arbiter: arbiter === "friend" ? "friend" : "me",
      template: tpl, close_preset: preset,
    });
    setBusy(false);
    setDone({ id: porra.id, slug: porra.slug });
    // Share sheet automático al publicar (F-03), sin bloquear la pantalla de
    // compartir: si el navegador no lo tiene, lo niega o se queda colgado (pasa en
    // algún WebView), el botón wa.me ya está debajo. Mismo tick que el clic →
    // conserva la activación de usuario que exige navigator.share.
    const url = withRef(porraUrl(porra.slug), myHandle);
    void nativeShare(title.trim(), tr("crear.shareNative", { title: title.trim() }), url);
  }

  if (done) {
    const url = withRef(porraUrl(done.slug), myHandle);
    const arb = normHandle(arbHandle);
    const text = tr("nueva.shareText", { title: title.trim(), url });
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

  return (
    <>
      {/* PLANTILLAS: un toque precarga pregunta, opciones, cierre y criterio */}
      <Field label={tr("crear.tplLabel")}>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PLANTILLAS.map((p) => {
            const active = tpl === p.key;
            return (
              <button key={p.key} type="button" onClick={() => applyTemplate(p.key)} aria-pressed={active}
                className="shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-bold"
                style={{
                  borderColor: active ? "var(--gold)" : "var(--line)",
                  color: active ? "var(--gold)" : "var(--muted)",
                  background: active ? "rgba(255,194,61,0.10)" : "var(--ink2)",
                }}>
                {p.emoji} {tr(`crear.tpl.${p.key}`)}
              </button>
            );
          })}
        </div>
      </Field>

      {/* BLOQUE 1 — PREGUNTA (+ dictado por voz) */}
      <Block n={1} title={tr("crear.step1")}>
        <input value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }} placeholder={tr("nueva.qPh")}
          aria-invalid={err?.field === "title"}
          className="w-full rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3 text-[15px] text-[var(--cream)] outline-none focus:border-[var(--win)] aria-[invalid=true]:border-[var(--red)]" />
        <ErrLine err={err} field="title" />
        {/* Ejemplos: dejar claro que te puedes apostar lo que sea (una cena, el
            café, un premio de patrocinador). Un toque rellena la pregunta. */}
        <div className="mt-1 flex flex-col gap-1.5">
          <span className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">{tr("crear.ideasLabel")}</span>
          <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["cena", "cafe", "finde", "premio"] as const).map((k) => (
              <button key={k} type="button" onClick={() => { setTitle(tr(`crear.idea.${k}.q`)); setErr(null); }}
                className="shrink-0 whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--ink2)] px-3 py-1.5 text-[12px] font-bold text-[var(--muted)]">
                {tr(`crear.idea.${k}`)}
              </button>
            ))}
          </div>
        </div>
        <VoiceToPorra onFilled={(q, o) => {
          setTitle(q);
          setOpts(o.length >= 2 ? o.slice(0, 6) : [...o, "", ""].slice(0, 2));
          setErr(null);
        }} />
      </Block>

      {/* BLOQUE 2 — OPCIONES */}
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

      {/* BLOQUE 3 — CIERRE + CRITERIO + RESULTADO ESPERADO */}
      <Block n={3} title={tr("crear.step3")}>
        <Field label={tr("nueva.closes")}>
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
            <p className="mono mt-2 text-[12px] text-[var(--win)]">⏱ {tr("crear.closesAt", { date: fmtLocal(closeDate) })}</p>
          )}
          <ErrLine err={err} field="close" />
        </Field>

        <Field label={tr("crear.criteria")}>
          <p className="mb-1.5 text-[13px] font-bold text-[var(--cream)]">{tr("crear.criteriaHelp")}</p>
          <textarea value={criteria} onChange={(e) => { setCriteria(e.target.value); setErr(null); }}
            placeholder={tr("crear.criteriaPh")} rows={2} maxLength={280} required
            aria-invalid={err?.field === "criteria"}
            className="w-full resize-none rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3 text-sm leading-snug text-[var(--cream)] outline-none focus:border-[var(--win)] aria-[invalid=true]:border-[var(--red)]" />
          <ErrLine err={err} field="criteria" />
        </Field>

        <Field label={tr("crear.resolvesAt")}>
          <input type="datetime-local" value={resolves}
            min={closeDate ? toLocalInput(closeDate) : undefined}
            onChange={(e) => { setResolves(e.target.value); setResolvesTouched(true); }}
            className="mono w-full rounded-[10px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
          <p className="mt-1 text-[11px] text-[var(--muted)]">{tr("crear.resolvesHint")}</p>
        </Field>
      </Block>

      {/* MÁS AJUSTES (plegado): juez, quién la ve, vídeo/foto/voz */}
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

            {/* MEDIA: grabar/subir vídeo, foto o voz */}
            <Field label={tr("nueva.media")}>
              <MediaCapture userId={userId} onMedia={(url, kind) => setMedia(url && kind ? { url, kind } : null)} />
            </Field>
          </div>
        )}
      </div>

      {err && err.field !== "arb" && <p className="text-center text-xs text-[var(--red)]">{err.msg}</p>}
      {err && err.field === "arb" && !more && <p className="text-center text-xs text-[var(--red)]">{err.msg}</p>}
      <button onClick={create} disabled={busy}
        className="rounded-[14px] bg-[var(--win)] px-4 py-4 text-center text-[15px] font-black text-[var(--ink)] disabled:opacity-50">
        {busy ? tr("crear.publishing") : tr("nueva.create")}
      </button>
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
