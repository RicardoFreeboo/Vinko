import type { ReactNode } from "react";
import { optionAccent, optionLetter } from "@/components/vote/VoteOption";
import { t } from "@/lib/i18n";

// Barra de resultado (VINKO_PANTALLAS §2): tu opción en verde 24 %, el resto
// crema 10 %; chip "✓ TÚ". Con <10 votos muestra "5 de 9" (+ avatares si se
// pasan); con ≥10, el porcentaje. 1:1 con `.res` del HTML.
export function ResultBar({
  idx, label, n, total, mine = false, won = false, avatars,
}: {
  idx: number;
  label: string;
  n: number;            // votos de ESTA opción
  total: number;        // votos totales de la porra
  mine?: boolean;       // es la opción que elegí
  won?: boolean;        // es la ganadora (porra resuelta)
  avatars?: ReactNode;  // pila de avatares (solo con <10 votos)
}) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  const few = total > 0 && total < 10;
  const accent = optionAccent(idx);
  return (
    <div
      className="relative flex h-[58px] items-center gap-2.5 overflow-hidden rounded-[15px] border-[1.5px] px-3.5"
      style={{ borderColor: mine || won ? "var(--win)" : "var(--line)", background: "var(--ink2)" }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0"
        style={{ width: `${pct}%`, background: mine ? "rgba(31,224,122,0.24)" : "rgba(244,241,233,0.10)" }}
      />
      <span
        className="relative grid h-7 w-7 flex-none place-items-center rounded-full border-2 font-black"
        style={{ borderColor: accent, color: accent, fontFamily: "var(--mono)", fontSize: 12.5 }}
      >
        {optionLetter(idx)}
      </span>
      <span className="relative text-[17px] font-bold text-[var(--cream)]">{label}{won ? " ✓" : ""}</span>
      {mine && (
        <span
          className="relative ml-1 inline-flex h-[22px] flex-none items-center gap-1 rounded-full px-2 text-[11px] font-black text-[var(--ink)]"
          style={{ background: "var(--win)", fontFamily: "var(--mono)" }}
        >
          {t("result.you")}
        </span>
      )}
      <span className="relative ml-auto flex items-center gap-2 text-[15px] font-bold" style={{ fontFamily: "var(--mono)" }}>
        {few ? (
          <>
            {avatars}
            <span>{t("result.ofTotal", { n: String(n), total: String(total) })}</span>
          </>
        ) : (
          <span>{pct}%</span>
        )}
      </span>
    </div>
  );
}
