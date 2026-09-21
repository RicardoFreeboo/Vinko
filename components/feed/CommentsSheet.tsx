"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { addComment, type Social } from "@/lib/social";
import type { FeedPorra } from "@/lib/feed";
import { t } from "@/lib/i18n";

// Hoja inferior de comentarios de una porra del feed (como la de PorraSocial,
// con el pick de cada uno para que se vea la polémica). Se cierra con Escape,
// tocando el fondo o la X. Vive FUERA del contenedor con scroll-snap para que
// la rueda no mueva el feed por debajo.
export function CommentsSheet({ p, social, loggedIn, onClose, onSent }: {
  p: FeedPorra; social: Social | undefined; loggedIn: boolean;
  onClose: () => void; onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    const txt = body.trim();
    if (!txt || busy) return;
    if (!loggedIn) { window.location.href = "/login?next=/feed"; return; }
    setBusy(true); setErr(null);
    const e = await addComment(p.id, txt);
    setBusy(false);
    if (e) { setErr(e.includes("UNSAFE") ? t("social.unsafe") : t("social.err")); return; }
    setBody("");
    onSent();
  }

  const comments = social?.comments ?? [];
  return (
    <div role="dialog" aria-modal="true" aria-label={t("social.comments")} onClick={onClose}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65">
      <div onClick={(e) => e.stopPropagation()}
        className="flex max-h-[78dvh] w-full max-w-[430px] flex-col rounded-t-[20px] border-t border-[var(--line)] bg-[var(--ink2)] shadow-[0_-12px_40px_rgba(0,0,0,0.6)]">
        {/* asa + título + cerrar */}
        <div className="flex flex-col px-4 pt-2.5">
          <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-white/25" />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[15px] font-black text-[var(--cream)]">
              {t("social.comments")} <span className="mono text-[13px] font-bold text-[var(--muted)]">{comments.length}</span>
            </p>
            <button onClick={onClose} aria-label={t("feed.close")}
              className="grid h-8 w-8 place-items-center rounded-full bg-[var(--ink3)] text-[15px] text-[var(--cream)]">✕</button>
          </div>
          <p className="mt-1 line-clamp-1 text-[12px] text-[var(--muted)]">{p.title}</p>
        </div>

        {/* lista */}
        <div className="mt-3 flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-3">
          {!social && <p className="py-6 text-center text-sm text-[var(--muted)]">{t("feed.loading")}</p>}
          {social && comments.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--muted)]">{t("social.first")}</p>
          )}
          {comments.map((c, i) => (
            <div key={i} className="flex gap-2.5 rounded-[12px] border border-[var(--line)] bg-[var(--ink)] p-3">
              <Avatar handle={c.handle} url={c.avatar} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-black text-[var(--cream)]">@{c.handle}</span>
                  {c.option && (
                    <span className="rounded-full bg-[var(--ink3)] px-2 py-0.5 text-[10px] font-bold text-[var(--gold)]">
                      {t("social.voted", { o: c.option })}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 break-words text-[14px] text-[var(--cream)]">{c.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* escribir */}
        <div className="border-t border-[var(--line)] p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <input ref={input} value={body} maxLength={300} placeholder={t("social.placeholder")}
              onChange={(e) => { setBody(e.target.value); setErr(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              className="min-w-0 flex-1 rounded-[12px] border border-[var(--line)] bg-[var(--ink)] px-3.5 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
            <button onClick={send} disabled={busy || !body.trim()}
              className="rounded-[12px] bg-[var(--win)] px-4 text-sm font-black text-[var(--ink)] disabled:opacity-40">
              {t("social.send")}
            </button>
          </div>
          {err && <p className="mt-2 text-xs text-[var(--red)]">{err}</p>}
        </div>
      </div>
    </div>
  );
}
