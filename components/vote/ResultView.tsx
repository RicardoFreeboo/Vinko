"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, X, ArrowRight, Copy, Share2 } from "lucide-react";
import { Receipt } from "@/components/vote/Receipt";
import { porraUrl } from "@/lib/share";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

// Pantalla de resultado del que participó (VINKO_PANTALLAS 07 "Lo dije" / 08
// "fallo"). Acierto: brillo verde/oro, check, "Lo dije.", "Solo el X% lo vio
// venir." + Receipt. Fallo: ✕ gris (NUNCA rojo), "Esta no la viste venir.",
// la racha sigue. Botones: «Compartir recibo» (la imagen 09, solo al acertar),
// copiar texto (para WhatsApp) y siguiente.
export function ResultView({
  won, visionario, question, handle, votedAt, receiptNo, saidLabel, pctAtPick,
  winningLabel, sawItPct, yoursPct = null, punteria = null, streakDays = null, slug,
}: {
  won: boolean;
  visionario: boolean;
  question: string;
  handle: string;
  votedAt: string;
  receiptNo: number | string;
  saidLabel: string;
  pctAtPick: number | null;
  winningLabel: string;
  sawItPct: number;          // % final de la ganadora
  yoursPct?: number | null;  // % final de tu opción (para el fallo)
  punteria?: number | null;
  streakDays?: number | null;
  slug: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyText =
    `Vinko 🎯 ${won ? t("result.wonTitle") : t("result.lostTitle")}\n` +
    `${question}\n` +
    (won
      ? `${t("result.copyMine", { opt: saidLabel, pct: String(sawItPct) })}\n${visionario ? "🟩 " + t("result.visionario") + "\n" : ""}`
      : `${t("result.copyLost", { winner: winningLabel })}\n`) +
    porraUrl(slug);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* sin clipboard: no pasa nada */ }
  }

  // VINKO_PANTALLAS 09: la PNG «LO DIJE.» como archivo al share sheet del móvil
  // (con el texto de siempre). Sin Web Share de archivos (escritorio), se
  // descarga la imagen (abrir una pestaña tras el fetch lo bloquearía el navegador).
  const [imgBusy, setImgBusy] = useState(false);
  async function shareImage() {
    if (imgBusy) return;
    setImgBusy(true);
    try {
      const res = await fetch(`/p/${slug}/recibo`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], "vinko-lo-dije.png", { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: copyText });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
      capture("porra_shared", { is_seed: false, via: "receipt_image", visionario });
    } catch { /* cancelado o sin red: queda «Copiar texto» */ }
    setImgBusy(false);
  }

  return (
    <section
      className="relative flex flex-col items-center gap-4 overflow-hidden rounded-[20px] border border-[var(--line)] p-6 text-center"
      style={{
        background: won
          ? "radial-gradient(120% 80% at 50% -10%, rgba(255,194,61,0.12), transparent 60%), radial-gradient(120% 80% at 50% 120%, rgba(31,224,122,0.10), transparent 60%), var(--ink2)"
          : "var(--ink2)",
      }}
    >
      <span
        className="grid h-14 w-14 place-items-center rounded-full"
        style={{
          background: won ? "var(--win)" : "var(--ink3)",
          color: won ? "var(--ink)" : "var(--muted)",
          boxShadow: won ? "0 0 26px -4px rgba(31,224,122,0.6)" : undefined,
        }}
      >
        {won ? <Check size={30} strokeWidth={3} aria-hidden /> : <X size={28} strokeWidth={3} aria-hidden />}
      </span>

      <div>
        <h2 className="text-[26px] font-black leading-tight text-[var(--cream)]" style={{ letterSpacing: "-0.03em" }}>
          {won ? t("result.wonTitle") : t("result.lostTitle")}
        </h2>
        <p className="mt-1.5 text-[14px] font-bold text-[var(--muted)]">
          {won
            ? t("result.wonSub", { pct: String(sawItPct) })
            : t("result.lostSub", { winner: winningLabel, yours: saidLabel, pct: String(yoursPct ?? sawItPct) })}
        </p>
      </div>

      <Receipt
        receiptNo={receiptNo}
        handle={handle}
        question={question}
        votedAt={votedAt}
        saidLabel={saidLabel}
        pctAtPick={pctAtPick}
        result={won ? "won" : "lost"}
        winningLabel={winningLabel}
        punteria={punteria}
        visionario={visionario}
      />

      {!won && streakDays != null && streakDays > 0 && (
        <p className="text-[13px] font-bold text-[var(--gold)]">{t("result.streakKeeps", { n: String(streakDays) })}</p>
      )}

      <div className="flex w-full flex-col gap-2.5">
        {won && (
          <button
            type="button"
            onClick={shareImage}
            disabled={imgBusy}
            className="flex h-14 items-center justify-center gap-2.5 rounded-full bg-[var(--win)] px-4 text-[17px] font-black text-[var(--ink)] disabled:opacity-70"
            style={{ boxShadow: "0 5px 0 var(--windeep), 0 10px 26px -8px rgba(31,224,122,0.45)" }}
          >
            <Share2 size={20} strokeWidth={2.4} aria-hidden />
            {imgBusy ? t("result.shareReceiptBusy") : t("result.shareReceipt")}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={copy}
            className="flex h-[52px] items-center justify-center gap-2 rounded-full border border-[var(--line2)] bg-[var(--ink3)] px-3 text-[15px] font-black text-[var(--cream)]"
          >
            <Copy size={17} aria-hidden />
            {copied ? t("result.copied") : won ? t("result.copyText") : t("result.shareFail")}
          </button>
          <Link
            href="/feed"
            className={won
              ? "flex h-[52px] items-center justify-center gap-2 rounded-full border border-[var(--line2)] bg-[var(--ink3)] px-3 text-[15px] font-black text-[var(--cream)]"
              : "flex h-[52px] items-center justify-center gap-2 rounded-full bg-[var(--win)] px-3 text-[15px] font-black text-[var(--ink)]"}
            style={won ? undefined : { boxShadow: "0 5px 0 var(--windeep)" }}
          >
            {t("result.next")} <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
