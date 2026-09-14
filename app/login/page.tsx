import type { Metadata } from "next";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("login.title") };

// Stub del PASO 2. El login real (Google + magic link, /auth/callback) es PASO 3.
export default function Login() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-bold">{t("login.title")}</h1>
      <p className="text-sm text-[var(--tx2)]">{t("login.body")}</p>
    </main>
  );
}
