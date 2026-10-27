import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

// Recibo del pronóstico (VINKO_PANTALLAS §2): tarjeta crema, tinta ink, mono,
// línea perforada y muescas laterales. n.º, @usuario, pregunta, fecha/hora del
// voto y las filas DIJE / LO PENSABA / RESULTADO / PUNTERÍA, con sello VISIONARIO.
function fmtWhen(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function Receipt({
  receiptNo, handle, question, votedAt, saidLabel, pctAtPick,
  result, winningLabel, punteria, visionario = false,
}: {
  receiptNo: number | string;
  handle: string;
  question: string;
  votedAt: string;             // ISO
  saidLabel: string;
  pctAtPick: number | null;
  result: "won" | "lost";
  winningLabel: string;
  punteria?: number | null;
  visionario?: boolean;
}) {
  const row = (k: string, v: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[#5d716b]">{k}</span>
      <span className="text-right text-[14px] font-black text-[#0c1011]">{v}</span>
    </div>
  );
  return (
    <div
      className="relative mx-auto w-full max-w-[340px] rounded-[14px] bg-[var(--cream)] p-[18px] text-[#0c1011] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]"
      style={{ fontFamily: "var(--mono)" }}
    >
      <span aria-hidden className="absolute -left-[11px] top-1/2 h-[22px] w-[22px] -translate-y-1/2 rounded-full bg-[var(--ink)]" />
      <span aria-hidden className="absolute -right-[11px] top-1/2 h-[22px] w-[22px] -translate-y-1/2 rounded-full bg-[var(--ink)]" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#5d716b]">
          {t("receipt.no")} #{String(receiptNo).padStart(5, "0")}
        </span>
        {visionario && (
          <span className="inline-flex items-center gap-1 rounded-[7px] bg-[var(--gold)] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.06em] text-[#0c1011]">
            ★ {t("result.visionario")}
          </span>
        )}
      </div>
      <p className="mt-2 text-[16px] font-black leading-tight text-[#0c1011]" style={{ fontFamily: "var(--disp)" }}>{question}</p>
      <p className="mt-1 text-[11px] text-[#5d716b]">@{handle} · {fmtWhen(votedAt)}</p>
      <div className="my-3 border-t-2 border-dashed border-[rgba(12,16,17,0.25)]" />
      {row(t("receipt.said"), saidLabel)}
      {pctAtPick != null && row(t("receipt.thought"), `${pctAtPick}%`)}
      {row(t("receipt.result"), result === "won" ? t("receipt.won") : t("receipt.resultLost", { winner: winningLabel }))}
      {punteria != null && punteria > 0 && row(t("receipt.punteria"), `+${punteria}`)}
    </div>
  );
}
