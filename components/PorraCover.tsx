import { coverTheme } from "@/lib/cover";
import { t } from "@/lib/i18n";

// Portada de una porra sin vídeo: degradado + emoji de la temática + etiqueta.
// Sirve en servidor y en cliente (no usa estado).
const EMOJI = { sm: "text-3xl", md: "text-5xl", lg: "text-7xl" } as const;
const FONDO = { sm: "text-[5rem]", md: "text-[9rem]", lg: "text-[16rem]" } as const;

export function PorraCover({ title, category, size = "md", className = "" }: {
  title: string; category?: string | null; size?: "sm" | "md" | "lg"; className?: string;
}) {
  const th = coverTheme(category, title);
  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ background: `radial-gradient(120% 90% at 25% 15%, ${th.glow} 0%, transparent 60%), linear-gradient(160deg, ${th.from} 0%, #0c1011 100%)` }}>
      {/* emoji grande de fondo, desenfocado */}
      <span aria-hidden className={`pointer-events-none absolute -bottom-[12%] -right-[8%] select-none leading-none opacity-[0.14] blur-[1px] ${FONDO[size]}`}>
        {th.emoji}
      </span>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <span aria-hidden className={`leading-none drop-shadow-[0_6px_18px_rgba(0,0,0,0.55)] ${EMOJI[size]}`}>{th.emoji}</span>
        {size !== "sm" && (
          <span className="mono rounded-full border border-white/20 bg-black/35 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white/80 backdrop-blur">
            {t(`cover.${th.key}`)}
          </span>
        )}
      </div>
    </div>
  );
}
