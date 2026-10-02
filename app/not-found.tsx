import Link from "next/link";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// FX-05 — 404 propio (antes salía el de Next, en inglés). Siempre hay a dónde ir.
export default function NotFound() {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo mark={44} word={28} />
      <div>
        <p className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted2)]">404</p>
        <h1 className="mt-1 text-xl font-black tracking-tight text-[var(--cream)]">{t("notfound.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{t("notfound.body")}</p>
      </div>
      <div className="flex gap-2">
        <Link href="/feed" className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[14px] font-black text-[var(--ink)]">
          {t("nav.feed")}
        </Link>
        <Link href="/" className="rounded-[12px] border border-[var(--line)] px-5 py-3 text-[14px] font-bold text-[var(--muted)]">
          {t("p.backHome")}
        </Link>
      </div>
    </main>
  );
}
