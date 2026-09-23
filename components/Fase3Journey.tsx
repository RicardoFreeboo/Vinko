"use client";
import { useState } from "react";
import Link from "next/link";
import { KycLevels } from "@/components/KycLevels";
import { EurAmount } from "@/components/money/EurAmount";
import { Logo } from "@/components/Logo";

// Recorrido guiado de Vinko con dinero (para inversores): botón "Empezar" y
// luego paso a paso. Datos de ejemplo; la custodia la hace el operador con
// licencia (Luckia, Fase 2). El núcleo nunca custodia dinero.
const card = "rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4";
const gold = "rounded-[16px] border border-[var(--gold)] bg-[var(--ink2)] p-4";
const Row = ({ l, r, dim = false }: { l: string; r: React.ReactNode; dim?: boolean }) => (
  <div className={`flex items-center justify-between text-[13px] ${dim ? "text-[var(--muted)]" : "text-[var(--cream)]"}`}>
    <span>{l}</span><span className="mono font-black">{r}</span>
  </div>
);

const STEPS: { title: string; sub: string; node: React.ReactNode }[] = [
  {
    title: "Verificas tu identidad",
    sub: "Por niveles, solo lo justo (lo exige la ley para jugar con euros).",
    node: <KycLevels current={1} />,
  },
  {
    title: "Ingresas euros",
    sub: "Bizum o tarjeta. Los euros los custodia el operador con licencia.",
    node: (
      <div className={card}>
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Euros · Disponible</p>
        <EurAmount cents={2000} size="xl" />
        <div className="mt-3 flex gap-2">
          <div className="flex-1 rounded-[12px] bg-[var(--win)] px-4 py-2.5 text-center text-[14px] font-black text-[var(--ink)]">Ingresar</div>
          <div className="flex-1 rounded-[12px] border border-[var(--line)] px-4 py-2.5 text-center text-[14px] font-black text-[var(--cream)]">Retirar</div>
        </div>
        <div className="mt-3 border-t border-[var(--line)] pt-2"><Row l="Ingreso · Bizum" r={<EurAmount cents={2000} size="sm" sign />} dim /></div>
      </div>
    ),
  },
  {
    title: "Entras en una porra con dinero",
    sub: "Eliges tu opción; ves tu entrada, la comisión de Vinko y qué cobrarías.",
    node: (
      <div className={gold}>
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">Jugar con dinero</p>
        <p className="mt-1 text-[15px] font-bold text-[var(--cream)]">¿Gana el Madrid el clásico?</p>
        <div className="mt-2 rounded-[14px] border-2 border-[var(--win)] bg-[rgba(31,224,122,0.08)] px-4 py-3 text-[15px] font-bold text-[var(--cream)]">Sí, gana el Madrid</div>
        <div className="mt-2 rounded-[14px] border border-[var(--line)] px-4 py-3 text-[15px] font-bold text-[var(--muted)]">No</div>
        <div className="mt-3 flex flex-col gap-1.5 rounded-[12px] border border-[var(--line)] bg-[var(--ink)] p-3">
          <Row l="Tu entrada" r="5,00 €" />
          <Row l="Comisión Vinko (5%)" r="−0,25 €" dim />
          <p className="text-[11px] leading-snug text-[var(--muted2)]">Si aciertas, cobras del reparto. El importe depende de cuántos acierten.</p>
          <Row l="Disponible: 20,00 €" r="quedará 15,00 €" dim />
        </div>
        <div className="mt-3 rounded-[14px] bg-[var(--win)] px-4 py-3.5 text-center text-[15px] font-black text-[var(--ink)]">Entrar con 5,00 €</div>
        <p className="mt-2 text-[10px] text-[var(--muted2)]">+18 · Juega con responsabilidad · Lo custodia un proveedor con licencia.</p>
      </div>
    ),
  },
  {
    title: "Se resuelve y cobras",
    sub: "Con la fuente oficial del resultado. El premio llega a tu cartera.",
    node: (
      <div className={card}>
        <p className="text-[14px] font-bold text-[var(--win)]">✓ Acertaste — ganó el Madrid</p>
        <div className="mt-2 flex flex-col gap-1.5 rounded-[12px] border border-[var(--line)] bg-[var(--ink)] p-3">
          <Row l="Premio" r={<EurAmount cents={860} size="sm" sign />} />
          <Row l="Nueva disponible" r="23,60 €" />
        </div>
      </div>
    ),
  },
  {
    title: "Retiras a tu cuenta",
    sub: "A una cuenta verificada a tu nombre. El operador la tramita.",
    node: (
      <div className={card}>
        <div className="flex flex-col gap-1.5">
          <Row l="● Solicitada" r="hoy 14:02" dim />
          <Row l="● En revisión" r="hoy 14:02" dim />
          <Row l="○ Enviada" r="—" dim />
          <Row l="○ Recibida" r="estimado 2 días" dim />
        </div>
      </div>
    ),
  },
  {
    title: "Vinko cobra su comisión",
    sub: "Ingreso B2B del operador licenciado. Registrado en /admin.",
    node: (
      <div className={card}>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><div className="text-[11px] uppercase text-[var(--muted)]">Liquidado</div><div className="mt-1 text-[18px] font-black text-[var(--win)]">360 €</div></div>
          <div><div className="text-[11px] uppercase text-[var(--muted)]">Pendiente</div><div className="mt-1 text-[18px] font-black text-[var(--gold)]">270 €</div></div>
          <div><div className="text-[11px] uppercase text-[var(--muted)]">Bolsas</div><div className="mt-1 text-[18px] font-black text-[var(--cream)]">12</div></div>
        </div>
      </div>
    ),
  },
];

export function Fase3Journey() {
  const [i, setI] = useState(-1); // -1 intro · 0..5 pasos · 6 final
  const total = STEPS.length;

  let content: React.ReactNode;
  if (i === -1) {
    content = (
      <div className="flex min-h-[68dvh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black text-[var(--cream)]">Vinko con dinero</h1>
          <p className="text-[14px] leading-snug text-[var(--muted)]">
            El recorrido completo, de punta a punta. La custodia la hace un operador con licencia; Vinko pone el producto y cobra su comisión.
          </p>
        </div>
        <button onClick={() => setI(0)} className="rounded-[14px] bg-[var(--win)] px-8 py-4 text-[17px] font-black text-[var(--ink)] transition-transform active:scale-95">Empezar →</button>
        <p className="text-[11px] text-[var(--muted2)]">6 pasos · datos de ejemplo</p>
      </div>
    );
  } else if (i >= total) {
    content = (
      <div className="flex min-h-[68dvh] flex-col items-center justify-center gap-6 text-center">
        <div className="text-5xl">🎉</div>
        <p className="text-[15px] leading-snug text-[var(--cream)]">
          Todo el producto está construido y funcionando. El interruptor de dinero real se enciende cuando cierre la integración con el operador con licencia (Luckia, Fase 2). Vinko nunca custodia el dinero: lo hace el operador.
        </p>
        <Link href="/showcase" className="rounded-[14px] bg-[var(--win)] px-6 py-3.5 text-[15px] font-black text-[var(--ink)]">Ver todas las pantallas →</Link>
        <button onClick={() => setI(-1)} className="text-[13px] font-bold text-[var(--muted)] underline">Volver a empezar</button>
      </div>
    );
  } else {
    const step = STEPS[i];
    content = (
      <div className="flex min-h-[72dvh] flex-col gap-5">
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, k) => (
            <div key={k} className="h-1.5 flex-1 rounded-full transition-colors duration-300" style={{ background: k <= i ? "var(--win)" : "var(--line)" }} />
          ))}
        </div>
        <p className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Paso {i + 1} de {total}</p>
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--win)] text-[16px] font-black text-[var(--ink)]">{i + 1}</span>
          <div>
            <div className="text-[18px] font-black text-[var(--cream)]">{step.title}</div>
            <div className="text-[12px] text-[var(--muted)]">{step.sub}</div>
          </div>
        </div>
        <div className="flex-1">{step.node}</div>
        <div className="sticky bottom-4 flex gap-2 pt-2">
          <button onClick={() => setI(i - 1)}
            className="rounded-[14px] border border-[var(--line)] bg-[var(--ink)] px-5 py-3.5 text-[15px] font-bold text-[var(--muted)] transition-transform active:scale-95">Atrás</button>
          <button onClick={() => setI(i + 1)}
            className="flex-1 rounded-[14px] bg-[var(--win)] px-5 py-3.5 text-center text-[15px] font-black text-[var(--ink)] transition-transform active:scale-95">
            {i + 1 === total ? "Terminar" : "Siguiente →"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col gap-5">
      <style>{"@keyframes f3step{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.f3anim{animation:none!important}}"}</style>
      <header className="flex items-center justify-between">
        <Logo mark={26} word={18} />
        <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted2)]">Dinero · recorrido</span>
      </header>
      <div key={i} className="f3anim" style={{ animation: "f3step .35s cubic-bezier(0.22,1,0.36,1)" }}>{content}</div>
    </div>
  );
}
