"use client";
import { ShareWhatsApp } from "@/components/ShareWhatsApp";
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MediaCapture } from "@/components/MediaCapture";
import { VoiceToPorra } from "@/components/VoiceToPorra";
import { Confetti } from "@/components/Confetti";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

// Crear porra en <30s: pregunta, 2–6 opciones, CIERRE (1h/24h/1 semana o fecha
// exacta en calendario), y ÁRBITRO (tú o un amigo, que deberá aceptar). Share
// solo wa.me con copy de lista blanca.
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

export function NuevaClient({ userId, origin }: { userId: string; origin: string }) {
  const [title, setTitle] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [preset, setPreset] = useState<Preset>("24h");
  const [custom, setCustom] = useState("");
  const [arbiter, setArbiter] = useState<"me" | "friend">("me");
  const [arbHandle, setArbHandle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [media, setMedia] = useState<{ url: string; kind: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ slug: string } | null>(null);

  function setOpt(i: number, v: string) { setOpts((o) => o.map((x, j) => (j === i ? v : x))); setErr(null); }

  async function create() {
    const clean = opts.map((o) => o.trim()).filter(Boolean);
    if (title.trim().length < 5 || title.trim().length > 120) { setErr(t("nueva.badTitle")); return; }
    if (clean.length < 2) { setErr(t("nueva.badOpts")); return; }
    if (preset === "custom" && !custom) { setErr(t("nueva.badDate")); return; }
    if (arbiter === "friend" && !arbHandle.trim()) { setErr(t("nueva.badArb")); return; }
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
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
      const { error: e3 } = await sb.rpc("set_arbiter", { p_porra: porra.id, p_handle: arbHandle.trim() });
      if (e3) { setBusy(false); setErr(t("nueva.arbNotFound")); return; }
    }
    setBusy(false);
    capture("porra_created", { is_seed: false });
    setDone({ slug: porra.slug });
  }

  if (done) {
    const url = `${origin}/p/${done.slug}`;
    const text = t("nueva.shareText", { title: title.trim(), url });
    const inviteText = t("nueva.inviteText", { handle: arbHandle.trim(), url });
    return (
      <section className="flex flex-col gap-3">
        <Confetti />
        <p className="text-center text-sm font-bold text-[var(--win)]">{t("nueva.share")}</p>
        <ShareWhatsApp text={text}
          className="rounded-[14px] bg-[#25D366] px-4 py-4 text-center text-[15px] font-black text-white">
          {t("nueva.shareCta")}
        </ShareWhatsApp>
        {arbiter === "friend" && arbHandle.trim() && (
          <ShareWhatsApp text={inviteText}
            className="rounded-[14px] border border-[var(--gold)] px-4 py-3 text-center text-[14px] font-black text-[var(--gold)]">
            {t("nueva.inviteArb")}
          </ShareWhatsApp>
        )}
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
              className="mono mt-2 w-full rounded-[10px] border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
            <p className="mt-1 text-[11px] text-[var(--muted)]">{t("nueva.arbHint")}</p>
            <ShareWhatsApp text={t("nueva.inviteReg", { url: origin })}
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
