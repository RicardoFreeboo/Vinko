"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { dailyCode, madridClock } from "@/lib/gate";
import { VMark } from "@/components/Logo";
import { t } from "@/lib/i18n";

const KEY = "vinko_gate";

// Candado de acceso por código diario sobre TODA la app privada del alfa.
//
// LOCKDOWN (24-sep-2026, orden de Ricardo «tapar todo, que no entre nadie»): el
// candado tapa también la portada "/" y las porras compartidas "/p/…". Quien no
// tenga sesión ni el código del día no ve NADA — ni el enlace de WhatsApp, ni la
// portada. Contrapartida asumida por Ricardo: muere el preview OG y la viralidad
// del enlace mientras el candado esté encendido.
//
// Rutas que SIGUEN abiertas (imprescindibles para que el propio login funcione):
//  · /privacidad /terminos  legales — deben ser accesibles (Google/GDPR).
//  · /auth                  callback de OAuth/magic-link: si se tapa, nadie puede
//                           completar el login (ni con el código).
// /secret (donde se lee el código) ya NO está abierta: solo con sesión. Ricardo,
// que está logueado, la ve; un extraño no. El código se comparte fuera de la app.
const ABIERTAS = ["/privacidad", "/terminos", "/auth"];

// El candado solo se enciende con NEXT_PUBLIC_ALPHA_GATE=on (quien tiene sesión
// sigue entrando sin código). /admin va aparte: comprueba role=admin en servidor.
const GATE_OFF = process.env.NEXT_PUBLIC_ALPHA_GATE !== "on";

export function Gate({ children, hasSession = false }: { children: React.ReactNode; hasSession?: boolean }) {
  const path = usePathname();
  const bypass = GATE_OFF || hasSession || ABIERTAS.some((r) => path?.startsWith(r));
  const [ok, setOk] = useState(false);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (bypass) { setReady(true); return; }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { day: string };
        if (saved.day === madridClock().day) setOk(true);
      }
    } catch { /* sin storage: pedirá código */ }
    setReady(true);
  }, [bypass]);

  if (bypass) return <>{children}</>;
  if (!ready) return null;
  if (ok) return <>{children}</>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const day = madridClock().day;
    if (input.trim() === dailyCode(day)) {
      try { localStorage.setItem(KEY, JSON.stringify({ day })); } catch { /* noop */ }
      setOk(true);
    } else {
      setErr(true);
    }
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
      <VMark size={56} />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-black tracking-tight">{t("gate.title")}</h1>
        <p className="text-sm leading-relaxed text-[var(--muted)]">{t("gate.body")}</p>
      </div>
      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <input
          inputMode="numeric"
          autoFocus
          value={input}
          onChange={(e) => { setInput(e.target.value); setErr(false); }}
          placeholder={t("gate.placeholder")}
          className="mono rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3.5 text-center text-lg tracking-[0.3em] text-[var(--cream)] outline-none focus:border-[var(--win)]"
        />
        {err && <span className="text-xs text-[var(--red)]">{t("gate.wrong")}</span>}
        <button
          type="submit"
          className="rounded-[12px] bg-[var(--win)] px-4 py-3.5 text-[15px] font-black text-[var(--ink)]"
        >
          {t("gate.enter")}
        </button>
      </form>
    </main>
  );
}
