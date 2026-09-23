"use client";
import { useEffect, useState } from "react";

// "Hoy os jugáis …": una palabra cada 2,2 s con un giro 3D vertical. Altura
// fija → cero saltos de maquetación. Con movimiento reducido se queda quieta.
// "🍺 unas cañas" → { emoji: "🍺", text: "unas cañas" }. Sin emoji delante → todo texto.
function split(w: string): { emoji: string; text: string } {
  const m = w.match(/^(\p{Extended_Pictographic}\S*)\s+(.*)$/u);
  return m ? { emoji: m[1], text: m[2] } : { emoji: "", text: w };
}

// `itemClassName` va en cada palabra (no en el contenedor): background-clip:text
// no alcanza a hijos posicionados y girados en 3D.
export function StakeRotator({
  items,
  className = "",
  itemClassName = "",
}: {
  items: string[];
  className?: string;
  itemClassName?: string;
}) {
  const [i, setI] = useState(0);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setLive(true);
    const id = window.setInterval(() => setI((n) => (n + 1) % items.length), 2200);
    return () => window.clearInterval(id);
  }, [items.length]);

  const prev = (i - 1 + items.length) % items.length;
  return (
    <span className={`lx-rot ${live ? "" : "lx-rot-static"} ${className}`.trim()} aria-live="off">
      {items.map((w, n) => (
        <span
          key={w}
          className="lx-rot-item"
          aria-hidden={n !== i}
          data-state={!live ? undefined : n === i ? "in" : n === prev ? "out" : undefined}
        >
          {/* el emoji va fuera del degradado: background-clip:text lo borraría */}
          {split(w).emoji && <span className="mr-[0.25em]">{split(w).emoji}</span>}
          <span className={itemClassName}>{split(w).text}</span>
        </span>
      ))}
    </span>
  );
}
