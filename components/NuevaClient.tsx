"use client";
import { ShareWhatsApp } from "@/components/ShareWhatsApp";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MediaCapture } from "@/components/MediaCapture";
import { VoiceToPorra } from "@/components/VoiceToPorra";
import { Confetti } from "@/components/Confetti";
import { capture } from "@/lib/analytics";
import { porraUrl, SITE } from "@/lib/share";
import { t } from "@/lib/i18n";

// Crear porra en <30s: pregunta, 2–6 opciones, CIERRE (1h/24h/1 semana o fecha
// exacta en calendario), y ÁRBITRO (tú o un amigo, que deberá aceptar). Share
// solo wa.me con copy de lista blanca.
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

type Preset = "1h" | "24h" | "1w" | "custom";
function closesAt(preset: Preset, custom: string): string {
  if (preset === "custom" && custom) return new Date(custom).toISOString();
  const d = new Date();
  if (preset === "1h") d.setHours(d.getHours() + 1);
  else if (preset === "24h") d.setDate(d.getDate() + 1);
  else d.setDate(d.getDate() + 7);
  return d.toISOString();
}

// @Usuario → usuario (lo que espera set_arbiter: handle en minúsculas, sin @).
const HANDLE_RX = /^[a-z0-9_]{3,30}$/;
function normHandle(s: string): string {
  return s.trim().replace(/^@+/, "").trim().toLowerCase();
}

// Añade ?ref=<handle> a un enlace (respeta una query previa).
function withRef(url: string, handle: string | null | undefined): string {
  if (!handle) return url;
  return `${url}${url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(handle)}`;
}

export function NuevaClient({ userId, handle }: { userId: string; origin?: string; handle?: string | null }) {
  const [title, setTitle] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [preset, setPreset] = useState<Preset>("24h");
  const [custom, setCustom] = useState("");
  const [arbiter, setArbiter] = useState<"me" | "friend">("me");
  const [arbHandle, setArbHandle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [media, setMedia] = useState<{ url: string; kind: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
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

  function setOpt(i: number, v: string) { setOpts((o) => o.map((x, j) => (j === i ? v : x))); setErr(null); }

  async function create() {
    const clean = opts.map((o) => o.trim()).filter(Boolean);
    const arb = normHandle(arbHandle);
    if (title.trim().length < 5 || title.trim().length > 120) { setErr(t("nueva.badTitle")); return; }
    if (clean.length < 2) { setErr(t("nueva.badOpts")); return; }
    if (preset === "custom" && !custom) { setErr(t("nueva.badDate")); return; }
    if (arbiter === "friend" && !arb) { setErr(t("nueva.badArb")); return; }
    if (arbiter === "friend" && !HANDLE_RX.test(arb)) { setErr(t("nueva.arbNotFound")); return; }
    if (arbiter === "friend" && myHandle && arb === myHandle.toLowerCase()) { setErr(t("nueva.arbSelf")); return; }
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null); setWarn(null);

    // El árbitro se comprueba ANTES de crear: si no existe, no se crea nada
    // (antes se creaba la porra y luego fallaba set_arbiter con VINKO_NO_USER).
    if (arbiter === "friend") {
      const { data: found } = await sb.from("profiles").select("id").eq("handle", arb).maybeSingle();
      if (!found) { setBusy(false); setErr(t("nueva.arbNotFound")); return; }
    }

    const slug = slugify(title);
    const { data: porra, error } = await sb.from("porras")
      .insert({
        slug, title: title.trim(), created_by: userId, closes_at: closesAt(preset, custom),
        visibility,
        media_url: media?.url ?? null,
        media_kind: media?.kind ?? null,
        video_status: media ? "pending" : "none",
      })
      .select("id, slug").single();
    if (error || !porra) { setBusy(false); setErr(t("nueva.badTitle")); return; }
    const rows = clean.slice(0, 6).map((label, idx) => ({ porra_id: porra.id, idx, label: label.slice(0, 40) }));
    const { error: e2 } = await sb.from("porra_options").insert(rows);
    if (e2) { setBusy(false); setErr(t("nueva.badOpts")); return; }
    if (arbiter === "friend") {
      // La porra ya existe: si esto falla, el juez eres tú y se avisa (sin duplicar porras).
      const { error: e3 } = await sb.rpc("set_arbiter", { p_porra: porra.id, p_handle: arb });
      if (e3) setWarn(t("nueva.arbFailed"));
    }
    setBusy(false);
    capture("porra_created", { is_seed: false, visibility, arbiter: arbiter === "friend" ? "friend" : "me" });
    setDone({ id: porra.id, slug: porra.slug });
  }

  if (done) {
    const url = withRef(porraUrl(done.slug), myHandle);
    const arb = normHandle(arbHandle);
    const text = t("nueva.shareText", { title: title.trim(), url });
    const inviteText = t("nueva.inviteText", { handle: arb, url });
    return (
      <section className="flex flex-col gap-3">
        <Confetti />
        <p className="text-center text-sm font-bold text-[var(--win)]">{t("nueva.share")}</p>
        {warn && <p className="text-center text-xs text-[var(--gold)]">{warn}</p>}
        <ShareWhatsApp text={text} porraId={done.id}
          className="rounded-[14px] bg-[#25D366] px-4 py-4 text-center text-[15px] font-black text-white">
          {t("nueva.shareCta")}
        </ShareWhatsApp>
        {arbiter === "friend" && arb && !warn && (
          <ShareWhatsApp text={inviteText}
            className="rounded-[14px] border border-[var(--gold)] px-4 py-3 text-center text-[14px] font-black text-[var(--gold)]">
            {t("nueva.inviteArb")}
          </ShareWhatsApp>
        )}
        <p className="mono break-all text-center text-[11px] text-[var(--muted)]">{url}</p>
        <Link href={`/p/${done.slug}`} className="text-center text-sm font-bold text-[var(--gold)]">{t("nueva.view")}</Link>
      </section>
    );
  }

  return (
    <>
      {/* DICTAR: la voz rellena la pregunta y las opciones (apk4) */}
      <VoiceToPorra onFilled={(q, o) => {
        setTitle(q);
        setOpts(o.length >= 2 ? o.slice(0, 6) : [...o, "", ""].slice(0, 2));
        setErr(null);
      }} />

      <Field label={t("nueva.q")}>
        <input value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }} placeholder={t("nueva.qPh")}
          className="w-full rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3 text-[15px] text-[var(--cream)] outline-none focus:border-[var(--win)]" />
      </Field>

      <Field label={t("nueva.opts")}>
        <div className="flex flex-col gap-2">
          {opts.map((o, i) => (
            <input key={i} value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={t("nueva.optPh", { n: String(i + 1) })}
              className="w-full rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
          ))}
          {opts.length < 6 && (
            <button onClick={() => setOpts((o) => [...o, ""])} className="self-start text-sm font-bold text-[var(--gold)]">{t("nueva.addOpt")}</button>
          )}
        </div>
      </Field>

      {/* MEDIA: grabar/subir vídeo, foto o voz (apk4) */}
      <Field label={t("nueva.media")}>
        <MediaCapture userId={userId} onMedia={(url, kind) => setMedia(url && kind ? { url, kind } : null)} />
      </Field>

      {/* CIERRE: presets + calendario */}
      <Field label={t("nueva.closes")}>
        <div className="grid grid-cols-3 gap-2">
          {(["1h", "24h", "1w"] as const).map((p) => (
            <Chip key={p} active={preset === p} onClick={() => setPreset(p)}>{t(`nueva.close.${p}`)}</Chip>
          ))}
        </div>
        <button onClick={() => setPreset("custom")}
          className={`mt-2 w-full rounded-[10px] border px-3 py-2 text-sm font-bold ${preset === "custom" ? "border-[var(--win)] text-[var(--win)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
          {t("nueva.close.custom")}
        </button>
        {preset === "custom" && (
          <input type="datetime-local" value={custom} min={new Date().toISOString().slice(0, 16)}
            onChange={(e) => { setCustom(e.target.value); setErr(null); }}
            className="mono mt-2 w-full rounded-[10px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
        )}
      </Field>

      {/* ÁRBITRO */}
      <Field label={t("nueva.arbiter")}>
        <div className="grid grid-cols-2 gap-2">
          <Chip active={arbiter === "me"} onClick={() => setArbiter("me")}>{t("nueva.arbMe")}</Chip>
          <Chip active={arbiter === "friend"} onClick={() => setArbiter("friend")}>{t("nueva.arbFriend")}</Chip>
        </div>
        {arbiter === "friend" && (
          <>
            <input value={arbHandle} onChange={(e) => { setArbHandle(e.target.value); setErr(null); }} placeholder={t("nueva.arbPh")}
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              className="mono mt-2 w-full rounded-[10px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
            <p className="mt-1 text-[11px] text-[var(--muted)]">{t("nueva.arbHint")}</p>
            <ShareWhatsApp text={t("nueva.inviteReg", { url: withRef(`${SITE}/`, myHandle) })}
              className="mt-2 block w-full rounded-[10px] border border-[var(--gold)] px-3 py-2 text-center text-[13px] font-bold text-[var(--gold)]">
              {t("nueva.inviteWa")}
            </ShareWhatsApp>
          </>
        )}
      </Field>

      {/* PÚBLICA / PRIVADA */}
      <Field label={t("nueva.visibility")}>
        <div className="grid grid-cols-2 gap-2">
          <Chip active={visibility === "public"} onClick={() => setVisibility("public")}>{t("nueva.public")}</Chip>
          <Chip active={visibility === "private"} onClick={() => setVisibility("private")}>{t("nueva.private")}</Chip>
        </div>
        <p className="mt-1 text-[11px] text-[var(--muted)]">{visibility === "private" ? t("nueva.privateHint") : t("nueva.publicHint")}</p>
      </Field>

      {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
      <button onClick={create} disabled={busy}
        className="rounded-[14px] bg-[var(--win)] px-4 py-4 text-center text-[15px] font-black text-[var(--ink)] disabled:opacity-50">
        {t("nueva.create")}
      </button>
    </>
  );
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
    <button onClick={onClick}
      className="rounded-[10px] border px-3 py-2.5 text-sm font-bold"
      style={{ borderColor: active ? "var(--win)" : "var(--line)", color: active ? "var(--win)" : "var(--muted)" }}>
      {children}
    </button>
  );
}
