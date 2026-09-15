"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// Login real: enlace mágico por email + Google. X/TikTok se añaden luego.
export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const redirectTo = () =>
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : undefined;

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const sb = supabaseBrowser();
    if (!sb) { setErr(t("login.notready")); return; }
    setBusy(true);
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  async function google() {
    setErr("");
    const sb = supabaseBrowser();
    if (!sb) { setErr(t("login.notready")); return; }
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) setErr(error.message);
  }

  if (sent) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo mark={48} word={30} />
        <h1 className="text-xl font-black tracking-tight">{t("login.sentTitle")}</h1>
        <p className="text-sm leading-relaxed text-[var(--muted)]">{t("login.sent", { email })}</p>
      </main>
    );
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6">
      <Logo mark={52} word={34} />
      <h1 className="text-xl font-black tracking-tight">{t("login.title2")}</h1>

      <button
        onClick={google}
        className="flex w-full items-center justify-center gap-3 rounded-[13px] bg-[var(--cream)] px-4 py-3.5 text-[15px] font-bold text-[#1a1a1a]"
      >
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.1 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.9l7.3-5.7z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.3 5.7c1.7-5.2 6.6-9 12.3-9z"/></svg>
        {t("login.google")}
      </button>

      <div className="flex w-full items-center gap-3 text-[11px] uppercase tracking-widest text-[var(--muted2)]">
        <span className="h-px flex-1 bg-[var(--line)]" />{t("login.or")}<span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <form onSubmit={magicLink} className="flex w-full flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("login.emailPh")}
          className="rounded-[13px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3.5 text-[15px] text-[var(--cream)] outline-none focus:border-[var(--win)]"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-[13px] bg-[var(--win)] px-4 py-3.5 text-[15px] font-black text-[var(--ink)] disabled:opacity-50"
        >
          {busy ? "…" : t("login.sendLink")}
        </button>
      </form>

      {err && <p className="text-xs text-[var(--red)]">{err}</p>}
      <p className="text-[11px] leading-relaxed text-[var(--muted2)]">{t("login.terms")}</p>
    </main>
  );
}
