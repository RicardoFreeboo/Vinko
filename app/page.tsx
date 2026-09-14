import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// LEGAL_LOCK=true: staging no público. Portada = alfa privada. Estética real de
// Vinko (verde-negro terminal, logo bocadillo+check+corona, lema en mono).
export default function Home() {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo mark={64} word={40} />
      <p className="eyebrow text-[11px]">{t("motto")}</p>
      <div className="mt-4 flex flex-col gap-2">
        <h1 className="text-2xl font-black tracking-tight [text-wrap:balance]">
          {t("lock.title")}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          {t("lock.body")}
        </p>
      </div>
    </main>
  );
}
