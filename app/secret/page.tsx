import type { Metadata } from "next";
import { SecretCode } from "@/components/SecretCode";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("secret.title"), robots: { index: false, follow: false } };

// Página privada del fundador: muestra el código de acceso del día + cuenta
// atrás hasta que rota. Compártela solo con el socio.
export default function Secret() {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo mark={40} word={26} />
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-black tracking-tight">{t("secret.title")}</h1>
        <p className="text-sm text-[var(--muted)]">{t("secret.body")}</p>
      </div>
      <SecretCode expiresLabel={t("secret.expires")} codeLabel={t("secret.code")} />
    </main>
  );
}
