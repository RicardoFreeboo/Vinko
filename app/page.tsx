import { t } from "@/lib/i18n";

// LEGAL_LOCK=true: staging no público. La portada solo enseña que el alfa es
// privada; las plantillas se comparten por su enlace /p/[slug] para probar OG.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="bg-gradient-to-r from-[var(--acc)] to-[var(--acc2)] bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
        {t("brand")}
      </span>
      <h1 className="text-xl font-bold">{t("lock.title")}</h1>
      <p className="text-sm text-[var(--tx2)]">{t("lock.body")}</p>
    </main>
  );
}
