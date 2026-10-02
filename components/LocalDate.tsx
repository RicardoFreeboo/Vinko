"use client";
import { useEffect, useState } from "react";

// FX-03: una fecha en la hora del DISPOSITIVO. En SSR (y en el primer render
// de hidratación) se pinta el `fallback` del servidor (hora de Madrid); en
// cuanto el cliente monta, se sustituye por la hora local. Así alguien en
// México lee su hora, no la de Madrid.
export function LocalDate({ iso, fallback }: { iso: string; fallback: string }) {
  const [txt, setTxt] = useState(fallback);
  useEffect(() => {
    try {
      setTxt(new Intl.DateTimeFormat("es-ES", {
        day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      }).format(new Date(iso)));
    } catch { /* se queda el fallback */ }
  }, [iso]);
  return <>{txt}</>;
}
