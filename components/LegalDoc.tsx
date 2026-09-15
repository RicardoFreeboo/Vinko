import Link from "next/link";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// Documento legal estático (privacidad / términos). Requisito de AdSense y RGPD.
// Lleva banner de "borrador pendiente de firma de abogado": no es asesoramiento
// legal ni presenta la app como legalmente cerrada (§ ALPHA FREEZE / LEGAL_LOCK).
export function LegalDoc({ titleKey, sectionKeys }: { titleKey: string; sectionKeys: string[] }) {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[680px] flex-col gap-5 px-5 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <Link href="/hoy"><Logo mark={28} word={20} /></Link>
        <Link href="/hoy" className="mono text-xs text-[var(--muted)]">← {t("legal.back")}</Link>
      </header>
      <div className="rounded-[12px] border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-4 py-2.5 text-[12px] font-bold text-[var(--gold)]">
        {t("legal.draft")}
      </div>
      <h1 className="text-2xl font-black text-[var(--cream)]">{t(titleKey)}</h1>
      <p className="mono text-[11px] uppercase tracking-wide text-[var(--muted)]">{t("legal.updated")}</p>
      <div className="flex flex-col gap-5">
        {sectionKeys.map((k) => (
          <section key={k} className="flex flex-col gap-1.5">
            <h2 className="text-[15px] font-black text-[var(--cream)]">{t(`${k}.h`)}</h2>
            <p className="whitespace-pre-line text-[14px] leading-relaxed text-[var(--muted)]">{t(`${k}.b`)}</p>
          </section>
        ))}
      </div>
      <nav className="mt-4 flex gap-4 border-t border-[var(--line)] pt-4 text-[12px] font-bold">
        <Link href="/privacidad" className="text-[var(--win)]">{t("legal.privacy.title")}</Link>
        <Link href="/terminos" className="text-[var(--win)]">{t("legal.terms.title")}</Link>
      </nav>
    </main>
  );
}
