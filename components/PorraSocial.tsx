"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

// Capa social de una porra: like, QUIÉN VA CON QUÉ (para el pique) y comentarios
// (cada uno muestra el voto del que comenta → polémica). El voto se ve para que
// haya debate ("tú has dicho Sí y comentas eso? 😂").
type Pick = { handle: string; avatar: string | null; option: string; idx: number };
type Comment = { handle: string; avatar: string | null; body: string; ts: string; option: string | null };
type Social = { likes: number; liked: boolean; picks: Pick[]; comments: Comment[] };

function Avatar({ handle, url, size = 28 }: { handle: string; url: string | null; size?: number }) {
  if (url) return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span className="grid place-items-center rounded-full bg-[var(--ink3)] text-[11px] font-black text-[var(--win)]" style={{ width: size, height: size }}>
      {handle?.slice(0, 2).toUpperCase()}
    </span>
  );
}
const optColor = (idx: number) => (idx % 2 ? "var(--gold)" : "var(--win)");

export function PorraSocial({ porraId, slug }: { porraId: string; slug: string }) {
  const [data, setData] = useState<Social | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: d } = await sb.rpc("porra_social", { p_porra: porraId });
    if (d) setData(d as Social);
  }
  useEffect(() => { void load(); }, [porraId]);

  async function like() {
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = `/login?next=/p/${slug}`; return; }
    const { data: r } = await sb.rpc("toggle_like", { p_porra: porraId });
    if (r) setData((d) => d ? { ...d, likes: (r as { count: number }).count, liked: (r as { liked: boolean }).liked } : d);
  }

  async function send() {
    const sb = supabaseBrowser();
    if (!sb || !body.trim()) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = `/login?next=/p/${slug}`; return; }
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("add_comment", { p_porra: porraId, p_body: body.trim() });
    setBusy(false);
    if (error) { setErr(error.message.includes("UNSAFE") ? t("social.unsafe") : t("social.err")); return; }
    setBody("");
    void load();
  }

  const d = data;
  return (
    <section className="flex flex-col gap-4 border-t border-[var(--line)] pt-5">
      {/* like + contador */}
      <div className="flex items-center gap-4">
        <button onClick={like} className="flex items-center gap-1.5 text-[15px] font-black" style={{ color: d?.liked ? "var(--red)" : "var(--muted)" }}>
          {d?.liked ? "❤️" : "🤍"} {d?.likes ?? 0}
        </button>
        <span className="mono text-[13px] text-[var(--muted)]">💬 {d?.comments.length ?? 0}</span>
      </div>

      {/* QUIÉN VA CON QUÉ */}
      {d && d.picks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("social.whoPicked")}</p>
          <div className="flex flex-col gap-1.5">
            {d.picks.slice(0, 30).map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Avatar handle={p.handle} url={p.avatar} size={24} />
                  <span className="text-[13px] font-bold text-[var(--cream)]">@{p.handle}</span>
                </span>
                <span className="rounded-full border px-2.5 py-0.5 text-[12px] font-bold" style={{ borderColor: optColor(p.idx), color: optColor(p.idx) }}>{p.option}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* comentarios */}
      <div className="flex flex-col gap-2">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("social.comments")}</p>
        {d && d.comments.length === 0 && <p className="text-sm text-[var(--muted)]">{t("social.first")}</p>}
        {d?.comments.map((c, i) => (
          <div key={i} className="flex gap-2.5 rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] p-3">
            <Avatar handle={c.handle} url={c.avatar} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-black text-[var(--cream)]">@{c.handle}</span>
                {c.option && <span className="rounded-full bg-[var(--ink3)] px-2 py-0.5 text-[10px] font-bold text-[var(--gold)]">{t("social.voted", { o: c.option })}</span>}
              </div>
              <p className="mt-0.5 text-[14px] text-[var(--cream)]">{c.body}</p>
            </div>
          </div>
        ))}
        {/* escribir */}
        <div className="mt-1 flex gap-2">
          <input value={body} onChange={(e) => { setBody(e.target.value); setErr(null); }} maxLength={300}
            placeholder={t("social.placeholder")} onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            className="flex-1 rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-3.5 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
          <button onClick={send} disabled={busy || !body.trim()} className="rounded-[12px] bg-[var(--win)] px-4 text-sm font-black text-[var(--ink)] disabled:opacity-40">{t("social.send")}</button>
        </div>
        {err && <p className="text-xs text-[var(--red)]">{err}</p>}
      </div>
    </section>
  );
}
