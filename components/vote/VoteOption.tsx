import type { ReactNode } from "react";

// Opción de voto del soft launch (VINKO_PANTALLAS §1.4/§2): letra en círculo
// (A/C/E verde, B/D oro — no depende solo del color, accesible a daltonismo),
// texto y un slot a la derecha (importe en Vinkos antes de votar, o ✓ al elegir).
// 1:1 con `.vote` del HTML. `idx` 0-based: par → verde, impar → oro.
export type VoteState = "idle" | "chosen" | "won";

export function optionAccent(idx: number): string {
  return idx % 2 === 0 ? "var(--win)" : "var(--gold)";
}
export function optionLetter(idx: number): string {
  return String.fromCharCode(65 + (idx % 26));
}

export function VoteOption({
  idx, label, state = "idle", onClick, disabled, trailing,
}: {
  idx: number;
  label: string;
  state?: VoteState;
  onClick?: () => void;
  disabled?: boolean;
  trailing?: ReactNode; // p. ej. el importe "🪙10"; se oculta al elegir (sale ✓)
}) {
  const accent = optionAccent(idx);
  const chosen = state === "chosen" || state === "won";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={chosen}
      className="relative flex h-[62px] w-full items-center gap-3 overflow-hidden rounded-[14px] border-[1.5px] px-4 text-left text-[18px] font-bold text-[var(--cream)] transition-colors disabled:cursor-default"
      style={{
        borderColor: chosen ? "var(--win)" : "var(--line)",
        background: state === "won" ? "rgba(31,224,122,0.10)" : chosen ? "rgba(31,224,122,0.22)" : "var(--ink2)",
      }}
    >
      <span
        className="grid h-8 w-8 flex-none place-items-center rounded-full border-2 font-black"
        style={{ borderColor: accent, color: accent, fontFamily: "var(--mono)", fontSize: 14 }}
      >
        {optionLetter(idx)}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="ml-auto flex-none">
        {chosen ? <span style={{ color: "var(--win)" }}>✓</span> : trailing}
      </span>
    </button>
  );
}
