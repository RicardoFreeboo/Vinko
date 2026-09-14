import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("login.title") };

// Stub del PASO 2. El login real (Google + magic link, /auth/callback) es PASO 3.
export default function Login() {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo mark={52} word={34} />
      <div className="mt-2 flex flex-col gap-2">
        <h1 className="text-xl font-black tracking-tight">{t("login.title")}</h1>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          {t("login.body")}
        </p>
      </div>
      <Link
        href="/"
        className="mono text-xs uppercase tracking-widest text-[var(--win)]"
      >
        {t("login.back")}
      </Link>
    </main>
  );
}
