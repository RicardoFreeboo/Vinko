// Componentes base del /admin — estética Vinko (verde-negro, verde/oro, mono).
import type { ReactNode } from "react";
import type { Tone } from "@/lib/admin";

export function Panel({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="eyebrow text-[11px]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Tile({
  label,
  value,
  def,
  accent = "var(--win)",
}: {
  label: string;
  value: string;
  def?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--ink3)] p-3.5">
      <div className="mono text-2xl font-black" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-1 text-[13px] font-bold text-[var(--cream)]">{label}</div>
      {def && <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">{def}</div>}
    </div>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--line)] py-2 last:border-0">
      <span className="text-[13px] text-[var(--muted)]">{label}</span>
      <span className="mono text-sm font-bold text-[var(--cream)]">{value}</span>
    </div>
  );
}

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[var(--win)] text-[var(--win)]",
  warn: "border-[var(--gold)] text-[var(--gold)]",
  unset: "border-[var(--muted2)] text-[var(--muted)]",
};

export function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={`mono rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] ${TONE_STYLE[tone]}`}
    >
      {label}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[var(--line)] bg-[var(--ink3)] px-4 py-10 text-center">
      <span className="mono text-sm text-[var(--muted)]">{text}</span>
    </div>
  );
}
