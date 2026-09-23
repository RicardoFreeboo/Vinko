"use client";
import { useEffect, useRef } from "react";
import { PhoneDemo } from "@/components/landing/PhoneDemo";
import { Coin3D } from "@/components/landing/Coin3D";
import { VinkoCoin } from "@/components/VinkoCoin";
import { t } from "@/lib/i18n";

// Escenario 3D del héroe: el móvil con la demo, fichas flotando a distintas
// profundidades (translateZ) y dos monedas girando. Con ratón, el conjunto se
// inclina siguiendo al puntero; sin ratón (móvil) o tras 2,5 s quieto, se
// balancea solo. Todo interpolado en un único requestAnimationFrame, que se
// para fuera de pantalla. Sin JS: balanceo por CSS (data-auto="1").
export function HeroStage() {
  const rig = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rig.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.dataset.auto = "0";

    const fine = window.matchMedia("(pointer: fine)").matches;
    let rx = 8, ry = -16; // actual
    let px = 0, py = 0; // puntero normalizado -1..1
    let lastMove = -1e9;
    let raf = 0;
    let running = true;
    const t0 = performance.now();

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = (e.clientX / window.innerWidth) * 2 - 1;
      py = (e.clientY / window.innerHeight) * 2 - 1;
      lastMove = performance.now();
    };
    // en móvil, el scroll también mueve un poco el escenario
    let scrollY = window.scrollY;
    const onScroll = () => { scrollY = window.scrollY; };

    const loop = (now: number) => {
      const idle = !fine || now - lastMove > 2500;
      const time = (now - t0) / 1000;
      const tx = idle ? 6 + Math.sin(time * 0.7) * 4 + Math.min(scrollY, 400) * 0.02 : 6 - py * 12;
      const ty = idle ? Math.sin(time * 0.45) * 18 - 4 : -6 + px * 22;
      rx += (tx - rx) * 0.06;
      ry += (ty - ry) * 0.06;
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
      if (running) raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([e]) => {
      const vis = e.isIntersecting && !document.hidden;
      if (vis && !running) { running = true; raf = requestAnimationFrame(loop); }
      if (!vis) { running = false; cancelAnimationFrame(raf); }
    });
    io.observe(el);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className="lx-stage h-[620px] lg:h-[680px]">
      <div ref={rig} className="lx-rig" data-auto="1">
        <div className="lx-phone">
          <div className="lx-notch" />
          <div className="lx-screen">
            <PhoneDemo />
          </div>
          <div className="lx-glare" />
        </div>

        <div className="lx-float f1" aria-hidden>
          <span>💬 {t("landing.float.share")}</span>
        </div>
        <div className="lx-float f2" aria-hidden>
          <span><VinkoCoin size={18} /> {t("landing.float.vinkos")}</span>
        </div>
        <div className="lx-float f3" aria-hidden>
          <span>{t("landing.float.pays")}</span>
        </div>
        <div className="lx-float f4" aria-hidden>
          <span>{t("landing.float.money")}</span>
        </div>

        <div className="lx-coin-slot"><Coin3D size={78} /></div>
        <div className="lx-coin-slot s2"><Coin3D size={52} /></div>
      </div>
    </div>
  );
}
