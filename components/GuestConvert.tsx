"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

// F-01: aviso tras un pick invitado (sesión anónima de Supabase). Un toque con
// Google: linkIdentity conserva el MISMO usuario (y por tanto su pick) y vuelve
// por /auth/callback, que llama a convert_guest() para activar el perfil y
// cobrar la entrada. Sin formulario. No se enlaza a /login: signInWithOtp
// crearía OTRA cuenta y el pick invitado se quedaría huérfano.
export function GuestConvert({ slug, hasPick = true }: { slug: string; hasPick?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function google() {
    const sb = supabaseBrowser();
    if (!sb) { setErr(t("login.notready")); return; }
    setBusy(true); setErr(null);
    const next = encodeURIComponent(`/p/${slug}`);
    const { error } = await sb.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    });
    // Sin error el navegador ya está yendo a Google; no hay nada que pintar.
    if (error) { setErr(t("guest.linkErr")); setBusy(false); }
  }

  return (
    <section
      aria-label={t("guest.savedTitle")}
      className="flex flex-col gap-3 rounded-[14px] border border-[var(--gold)] bg-[var(--ink2)] p-4"
    >
      <div>
        <p className="text-[15px] font-black text-[var(--cream)]">
          {hasPick ? t("guest.savedTitle") : t("guest.pendingTitle")}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{t("guest.savedBody")}</p>
      </div>
      <button
        type="button"
        onClick={google}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-[13px] bg-[var(--cream)] px-4 py-3.5 text-[15px] font-bold text-[#1a1a1a] disabled:opacity-50"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.1 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.9l7.3-5.7z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.3 5.7c1.7-5.2 6.6-9 12.3-9z"/></svg>
        {busy ? "…" : t("login.google")}
      </button>
      <p className="text-center text-[11px] leading-relaxed text-[var(--muted2)]">{t("guest.keep")}</p>
      {err && <p className="text-center text-xs text-[var(--red)]">{err}</p>}
    </section>
  );
}
