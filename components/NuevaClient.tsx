"use client";
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

// Crear porra en <30 s (§PASO 4): título, 2–6 opciones, cierre hoy/mañana,
// "Crear y compartir". Share solo wa.me con copy de lista blanca. La inserción
// va con RLS (created_by = auth.uid(), source=user); el trigger da XP + racha.
function slugify(title: string): string {
  const base = title.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const rnd = Math.random().toString(36).slice(2, 6);
  return ((base.length >= 3 ? base : "porra") + "-" + rnd).slice(0, 80);
}

function closesAt(when: "today" | "tomorrow"): string {
  const d = new Date();
  if (when === "tomorrow") d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

export function NuevaClient({ userId, origin }: { userId: string; origin: string }) {
  const [title, setTitle] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [when, setWhen] = useState<"today" | "tomorrow">("tomorrow");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ slug: string } | null>(null);

  function setOpt(i: number, v: string) {
    setOpts((o) => o.map((x, j) => (j === i ? v : x)));
    setErr(null);
  }

  async function create() {
    const clean = opts.map((o) => o.trim()).filter(Boolean);
    if (title.trim().length < 5 || title.trim().length > 120) { setErr(t("nueva.badTitle")); return; }
    if (clean.length < 2) { setErr(t("nueva.badOpts")); return; }
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const slug = slugify(title);
    const { data: porra, error } = await sb.from("porras")
      .insert({ slug, title: title.trim(), created_by: userId, closes_at: closesAt(when) })
      .select("id, slug").single();
    if (error || !porra) { setBusy(false); setErr(t("nueva.badTitle")); return; }
    const rows = clean.slice(0, 6).map((label, idx) => ({ porra_id: porra.id, idx, label: label.slice(0, 40) }));
    const { error: e2 } = await sb.from("porra_options").insert(rows);
    setBusy(false);
    if (e2) { setErr(t("nueva.badOpts")); return; }
    capture("porra_created", { is_seed: false });
    setDone({ slug: porra.slug });
  }

  if (done) {
    const url = `${origin}/p/${done.slug}`;
    const text = t("nueva.shareText", { title: title.trim(), url });
    return (
      <section className="flex flex-col gap-3">
        <p className="text-center text-sm font-bold text-[var(--win)]">{t("nueva.share")}</p>
        <button
          onClick={() => {
            capture("porra_shared", { is_seed: false });
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
          }}
          className="rounded-[14px] bg-[var(--win)] px-4 py-4 text-center text-[15px] font-black text-[var(--ink)]">
          {t("nueva.shareCta")}
        </button>
        <Link href={`/p/${done.slug}`} className="text-center text-sm font-bold text-[var(--gold)]">
          {t("nueva.view")}
        </Link>
      </section>
    );
  }

  return (
    <>
      <div>
        <label className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("nueva.q")}</label>
        <input value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }}
          placeholder={t("nueva.qPh")}
          className="mt-1 w-full rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3 text-[15px] text-[var(--cream)] outline-none focus:border-[var(--win)]" />
      </div>

      <div className="flex flex-col gap-2">
        <label className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("nueva.opts")}</label>
        {opts.map((o, i) => (
          <input key={i} value={o} onChange={(e) => setOpt(i, e.target.value)}
            placeholder={t("nueva.optPh", { n: String(i + 1) })}
            className="w-full rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
        ))}
        {opts.length < 6 && (
          <button onClick={() => setOpts((o) => [...o, ""])}
            className="self-start text-sm font-bold text-[var(--gold)]">{t("nueva.addOpt")}</button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("nueva.closes")}</label>
        <div className="flex gap-2">
          {(["today", "tomorrow"] as const).map((w) => (
            <button key={w} onClick={() => setWhen(w)}
              className="flex-1 rounded-[10px] border px-3 py-2.5 text-sm font-bold"
              style={{ borderColor: when === w ? "var(--win)" : "var(--line)", color: when === w ? "var(--win)" : "var(--muted)" }}>
              {t(w === "today" ? "nueva.today" : "nueva.tomorrow")}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
      <button onClick={create} disabled={busy}
        className="rounded-[14px] bg-[var(--win)] px-4 py-4 text-center text-[15px] font-black text-[var(--ink)] disabled:opacity-50">
        {t("nueva.create")}
      </button>
    </>
  );
}
