"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { VinkoCoin } from "@/components/VinkoCoin";
import { SITE } from "@/lib/share";
import { t } from "@/lib/i18n";

// ESCRITORIO (≥1024px, estilo TikTok/Instagram web): tres columnas — barra
// lateral con la misma navegación que el AppNav inferior (que se oculta con
// lg:hidden), la página en el centro y un carril derecho con el enlace de
// invitación, el pique del día y el aviso de instalar en el móvil.
//
// Por debajo de lg NO cambia nada: los hijos van dentro de un <div> sin clases
// móviles (solo `lg:`), así el móvil sigue pixel-idéntico. La columna central
// lleva `contain: layout` en escritorio para que los elementos `fixed` de las
// páginas (header del feed, hojas) se centren en ella y no en la ventana.
// El ancho de la página lo sube app/globals.css (.vk-shell main.amb → 600px);
// el feed vertical conserva sus 430px porque los fija él mismo.
//
// Sin shell: portada, /p (la landing de WhatsApp va limpia), auth, legales,
// /secret, /admin y /s.
const SIN_SHELL = ["/p/", "/login", "/auth", "/bienvenida", "/privacidad", "/terminos", "/secret", "/admin", "/s/", "/demo"];

// Mismos ítems, orden e iconos que components/AppNav.tsx + Novedades · Buscar · Ajustes.
const NAV: ReadonlyArray<{ href: string; key: string; icon: ReactNode; primary?: boolean }> = [
  { href: "/feed", key: "nav.feed", icon: "▦" },
  { href: "/perfil", key: "nav.perfil", icon: "◉" },
  { href: "/nueva", key: "nav.crear", icon: "＋", primary: true },
  { href: "/grupos", key: "nav.grupos", icon: "⌂" },
  { href: "/liga", key: "nav.liga", icon: "▲" },
  { href: "/saldo", key: "nav.saldo", icon: <VinkoCoin size={16} /> },
  { href: "/buzon", key: "nav.buzon", icon: "🔔" },
  { href: "/buscar", key: "buscar.title", icon: "🔍" },
  { href: "/ajustes", key: "ajustes.title", icon: "⚙" },
];

// Sesión leída en cliente (RLS deja leer tu propia fila). undefined = cargando.
type Me = { handle: string | null; points: number; streak: number };

function useMe(): Me | null | undefined {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const sb = supabaseBrowser();
      if (!sb) { setMe(null); return; }
      const { data: { user } } = await sb.auth.getUser();
      // Invitados (sesión anónima) no tienen enlace de invitación.
      if (!user || (user as { is_anonymous?: boolean }).is_anonymous) { if (vivo) setMe(null); return; }
      const { data } = await sb.from("profiles").select("handle, points, streak_days").eq("id", user.id).maybeSingle();
      if (vivo) setMe({ handle: data?.handle ?? null, points: data?.points ?? 0, streak: data?.streak_days ?? 0 });
    })().catch(() => { if (vivo) setMe(null); });
    return () => { vivo = false; };
  }, []);
  return me;
}

export function DesktopShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const bare = !path || path === "/" || SIN_SHELL.some((r) => path.startsWith(r));
  if (bare) return <>{children}</>;

  return (
    <div className="vk-shell lg:mx-auto lg:grid lg:min-h-dvh lg:max-w-[1440px] lg:grid-cols-[240px_minmax(0,1fr)_320px]">
      <Sidebar path={path} />
      <div className="lg:min-w-0 lg:[contain:layout]">{children}</div>
      <Rail />
    </div>
  );
}

function Sidebar({ path }: { path: string }) {
  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:self-start lg:border-r lg:border-[var(--line)] lg:px-4 lg:py-6">
      <Link href="/feed" aria-label={t("brand")} className="mb-6 px-3">
        <Logo mark={32} word={24} />
      </Link>
      <nav aria-label={t("nav.label")} className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = path === item.href || path.startsWith(item.href + "/");
          if (item.primary) {
            // CREAR: botón principal, como el círculo verde del AppNav
            return (
              <Link key={item.href} href={item.href}
                className="my-2 flex items-center justify-center gap-2 rounded-full bg-[var(--win)] px-4 py-3 text-[15px] font-black text-[var(--ink)] shadow-[0_0_20px_rgba(31,224,122,0.35)]">
                <span aria-hidden className="text-xl leading-none">{item.icon}</span>
                {t(item.key)}
              </Link>
            );
          }
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[15px] font-bold transition-colors hover:bg-[var(--ink2)] ${
                active ? "bg-[var(--ink2)] text-[var(--win)]" : "text-[var(--cream)]"
              }`}>
              <span aria-hidden className="grid w-6 place-items-center text-[17px] leading-none">{item.icon}</span>
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
      <footer className="mt-auto flex flex-col gap-1.5 px-3">
        <nav className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted2)]">
          <Link href="/privacidad" className="underline">{t("legal.privacy.title")}</Link>
          <Link href="/terminos" className="underline">{t("legal.terms.title")}</Link>
        </nav>
        <p className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted2)]">{t("og.footer")}</p>
      </footer>
    </aside>
  );
}

function Rail() {
  const me = useMe();
  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-4 lg:self-start lg:overflow-y-auto lg:border-l lg:border-[var(--line)] lg:px-5 lg:py-6">
      {me === undefined ? null : me ? <InviteCard me={me} /> : <LoginCard />}

      {/* PIQUE DEL DÍA: vive en el primer slide del feed */}
      <Link href="/feed" className="flex flex-col gap-1 rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4 transition-colors hover:border-[var(--win)]">
        <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--win)]">{t("desktop.daily.title")}</span>
        <span className="text-[13px] leading-snug text-[var(--cream)]">{t("desktop.daily.body")}</span>
        <span className="mt-1 text-[13px] font-black text-[var(--win)]">{t("desktop.daily.cta")}</span>
      </Link>

      {/* INSTALAR EN EL MÓVIL: la app está pensada para el móvil (PWA) */}
      <div className="flex flex-col gap-1 rounded-[16px] border border-[var(--line)] p-4">
        <span className="text-[13px] font-black text-[var(--cream)]">📱 {t("desktop.install.title")}</span>
        <span className="text-[12px] leading-snug text-[var(--muted)]">{t("desktop.install.body")}</span>
      </div>
    </aside>
  );
}

// TU ENLACE: mismo enlace que en /saldo (vinkos.refTitle). Copiar + WhatsApp.
function InviteCard({ me }: { me: Me }) {
  const [copied, setCopied] = useState(false);
  const url = me.handle ? `${SITE}/?ref=${encodeURIComponent(me.handle)}` : `${SITE}/`;
  const wa = `https://wa.me/?text=${encodeURIComponent(t("vinkos.inviteText", { url }))}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* sin portapapeles: el texto es seleccionable */ }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-[var(--gold)]/40 bg-[var(--ink2)] p-4">
      <div className="flex items-center justify-between gap-2">
        {me.handle ? (
          <Link href={`/u/${me.handle}`} className="truncate text-[14px] font-black text-[var(--cream)]">@{me.handle}</Link>
        ) : <span />}
        <span className="flex shrink-0 items-center gap-1.5">
          {/* racha + Vinkos, como en el header del feed y en /saldo */}
          <span className="flex items-center gap-1 rounded-full border border-[var(--gold)]/50 px-2 py-0.5 text-[12px] font-black text-[var(--gold)]" aria-label={t("hoy.streak")}>
            🔥 {me.streak}
          </span>
          <Link href="/saldo" className="mono flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[12px] font-black text-[var(--cream)]" aria-label={t("saldo.coins")}>
            <VinkoCoin size={13} />{me.points}
          </Link>
        </span>
      </div>
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("vinkos.refTitle")}</p>
      <p className="text-[12px] leading-snug text-[var(--cream)]">{t("desktop.invite.body")}</p>
      <div className="flex items-stretch gap-2">
        <p className="mono min-w-0 flex-1 select-all truncate rounded-[10px] bg-[var(--ink3)] px-3 py-2 text-[12px] leading-5 text-[var(--gold)]">{url}</p>
        <button type="button" onClick={copiar}
          className="shrink-0 rounded-[10px] border border-[var(--line)] px-3 text-[12px] font-black text-[var(--cream)] hover:border-[var(--win)]">
          {copied ? t("desktop.copied") : t("desktop.copy")}
        </button>
      </div>
      <a href={wa} target="_blank" rel="noopener noreferrer"
        className="rounded-[12px] bg-[#25D366] px-4 py-2.5 text-center text-[13px] font-black text-white">
        {t("vinkos.refWa")}
      </a>
    </section>
  );
}

function LoginCard() {
  return (
    <section className="flex flex-col gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4">
      <p className="text-[15px] font-black text-[var(--cream)]">{t("desktop.login.title")}</p>
      <p className="text-[12px] leading-snug text-[var(--muted)]">{t("home.loginCard")}</p>
      <Link href="/login?next=/feed" className="mt-1 rounded-full bg-[var(--win)] px-4 py-2.5 text-center text-[13px] font-black text-[var(--ink)]">
        {t("home.loginCta")}
      </Link>
    </section>
  );
}
