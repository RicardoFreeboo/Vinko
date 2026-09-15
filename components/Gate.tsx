"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { dailyCode, madridClock } from "@/lib/gate";
import { VMark } from "@/components/Logo";
import { t } from "@/lib/i18n";

const KEY = "vinko_gate";

// Candado de acceso por código diario sobre la app privada del alfa.
//
// Rutas SIEMPRE abiertas (sin código):
//  · "/"                  portada pública — Google exige poder ver de qué va la
//                         app sin login para verificar el dominio del OAuth.
//  · /privacidad /terminos legales — Google las rastrea.
//  · /p/…                 porras compartidas: si esto se tapa, el enlace de
//                         WhatsApp muere y con él la viralidad (métrica sagrada).
//  · /login /auth /bienvenida  para poder entrar desde un enlace compartido.
//  · /secret              donde el fundador lee el código del día.
const ABIERTAS = ["/secret", "/privacidad", "/terminos", "/p/", "/login", "/auth", "/bienvenida"];

export function Gate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const bypass = path === "/" || ABIERTAS.some((r) => path?.startsWith(r));
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
