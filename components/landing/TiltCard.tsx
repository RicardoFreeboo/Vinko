"use client";
import { useRef, type ReactNode } from "react";

// Tarjeta que se inclina en 3D siguiendo al ratón, con un brillo que sigue al
// puntero. Solo ratón (en táctil no hay hover: queda plana). Los hijos pueden
// usar .lx-pop-z / .lx-pop-z2 para "salir" de la tarjeta en profundidad.
export function TiltCard({
  children,
  className = "",
  max = 10,
  style,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.dataset.hover = "1";
    el.style.setProperty("--try", `${(px - 0.5) * 2 * max}deg`);
    el.style.setProperty("--trx", `${(0.5 - py) * 2 * max}deg`);
    el.style.setProperty("--gx", `${px * 100}%`);
    el.style.setProperty("--gy", `${py * 100}%`);
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.dataset.hover = "0";
    el.style.setProperty("--try", "0deg");
    el.style.setProperty("--trx", "0deg");
  }

  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={`lx-tilt ${className}`.trim()} style={style}>
      {children}
      <span aria-hidden className="lx-tilt-glare" />
    </div>
  );
}
