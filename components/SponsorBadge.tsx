import { t as t0 } from "@/lib/i18n";
import esParts from "@/messages/parts/sponsors.es.json";
import enParts from "@/messages/parts/sponsors.en.json";

// t() con red de seguridad: hasta que scripts/i18n-merge.mjs funda
// messages/parts/sponsors.*.json en es.json/en.json, t() devolvería la propia
// clave. Tras la fusión t() resuelve y este respaldo deja de intervenir.
const PARTS: Record<string, Record<string, string>> = { es: esParts, en: enParts };
export function tSponsors(key: string, vars?: Record<string, string>): string {
  let s = t0(key, vars);
  if (s === key) {
    s = PARTS.es[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

// Fila de la vista pública sponsorships_public (0039): solo campañas en vivo
// y en ventana; sin presupuesto, sin token, sin email.
export type SponsorshipPublic = {
  id: string;
  target_type: string;
  target_id: string | null;
  sponsor_name: string;
  sponsor_logo_url: string | null;
  sponsor_url: string | null;
  cta_text_es: string | null;
  cta_text_en: string | null;
  cta_url: string | null;
  disclosure_label: string | null;
  banner_url: string | null;
  starts_at: string;
  ends_at: string;
};

// Etiqueta «Patrocinado por» + logo/nombre (+ CTA opcional). Server-safe (sin
// hooks): sirve en páginas de servidor y dentro de componentes cliente.
// Nunca en /p/[slug] ni en el flujo de pronóstico (M-01). El cableado en
// /liga, /hoy o el resumen semanal lo decide cada pantalla; aquí solo la pieza.
export function SponsorBadge({
  s, lang = "es", cta = false, size = "sm",
}: {
  s: SponsorshipPublic;
  lang?: "es" | "en";
  cta?: boolean;
  size?: "sm" | "md";
}) {
  const label = s.disclosure_label?.trim() || tSponsors("sponsors.badge.disclosure");
  const ctaText = (lang === "en" ? s.cta_text_en || s.cta_text_es : s.cta_text_es || s.cta_text_en) || null;
  const md = size === "md";
  const name = `font-bold text-[var(--cream)] ${md ? "text-[14px]" : "text-[12px]"}`;
  return (
    <div
      data-sponsorship={s.id}
      className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border border-[var(--line)] bg-[var(--ink2)] ${md ? "px-3 py-2" : "px-2 py-1"}`}
    >
      <span className={`mono uppercase tracking-[0.1em] text-[var(--muted)] ${md ? "text-[11px]" : "text-[10px]"}`}>
        {label}
      </span>
      {s.sponsor_logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.sponsor_logo_url} alt="" className={`${md ? "h-6" : "h-5"} w-auto max-w-[110px] object-contain`} />
      )}
      {s.sponsor_url ? (
        <a href={s.sponsor_url} target="_blank" rel="sponsored noopener noreferrer" className={name}>{s.sponsor_name}</a>
      ) : (
        <span className={name}>{s.sponsor_name}</span>
      )}
      {cta && ctaText && s.cta_url && (
        <a href={s.cta_url} target="_blank" rel="sponsored noopener noreferrer"
          className="rounded-full border border-[var(--gold)] px-2 py-0.5 text-[11px] font-black text-[var(--gold)]">
          {ctaText}
        </a>
      )}
    </div>
  );
}
