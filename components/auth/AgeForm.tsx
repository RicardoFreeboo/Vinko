"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// Pantalla +18 declarado (año de nacimiento). No es control de identidad.
export function AgeForm({ next }: { next: string }) {
  const [year, setYear] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const thisYear = new Date().getFullYear();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const y = parseInt(year, 10);
    if (!y || y < 1900 || y > thisYear) { setErr(t("age.bad")); return; }
    if (thisYear - y < 14) { setErr(t("age.under14")); return; } // edad mínima de registro
    const sb = supabaseBrowser();
    if (!sb) { setErr(t("login.notready")); return; }
    setBusy(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setBusy(false); router.push("/login"); return; }
    const { error } = await sb.from("profiles").update({ birth_year: y }).eq("id", user.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push(next.startsWith("/") ? next : "/");
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo mark={48} word={30} />
      <h1 className="text-xl font-black tracking-tight">{t("age.title")}</h1>
      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <input
          inputMode="numeric"
          value={year}
          onChange={(e) => { setYear(e.target.value); setErr(""); }}
          placeholder={t("age.ph")}
          className="mono rounded-[13px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3.5 text-center text-lg tracking-[0.2em] text-[var(--cream)] outline-none focus:border-[var(--win)]"
        />
        {err && <span className="text-xs text-[var(--red)]">{err}</span>}
        <button type="submit" disabled={busy} className="rounded-[13px] bg-[var(--win)] px-4 py-3.5 text-[15px] font-black text-[var(--ink)] disabled:opacity-50">
          {busy ? "…" : t("age.submit")}
        </button>
      </form>
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">{t("age.body")}</p>
    </main>
  );
}
