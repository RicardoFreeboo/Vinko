"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Vídeo de IA que RELLENA su contenedor (el padre debe ser `relative`).
// 1. Ritmo más ágil (los clips Kling van algo lentos): sube el playbackRate y lo
//    reaplica tras cada loop (algunos navegadores lo resetean).
// 2. `fallback` (la portada temática) se pinta SIEMPRE debajo, también en el
//    HTML del servidor: mientras baja el primer fotograma, sin JS, si el
//    navegador bloquea el autoplay o si el fichero falla, se ve la portada y
//    nunca un recuadro vacío.
// 3. En el feed (`eager` false) solo carga y reproduce lo que está en pantalla
//    (IntersectionObserver): con 15 vídeos entre historias y tarjetas,
//    reproducirlos todos a la vez satura un Android medio. `active=false` los
//    pausa aunque sigan en pantalla (p. ej. con el visor abierto encima).
// 4. `eager` (un único vídeo visible nada más abrir: /p y el visor) arranca
//    desde el propio HTML con autoplay, sin esperar a que hidrate React.
export function FastVideo({ src, speed = 1.4, className = "", poster, fallback, eager = false, active = true }: {
  src: string; speed?: number; className?: string; poster?: string; fallback?: ReactNode;
  eager?: boolean; active?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true; // el autoplay exige muted como propiedad, no solo atributo
    const set = () => { try { v.playbackRate = speed; } catch { /* noop */ } };
    set();
    v.addEventListener("loadedmetadata", set);
    v.addEventListener("play", set);
    v.addEventListener("seeked", set);
    const play = () => { v.play().catch(() => { /* autoplay bloqueado: queda la portada */ }); };
    let io: IntersectionObserver | null = null;
    if (!active) {
      v.pause();
    } else if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { v.preload = "auto"; play(); }
        else v.pause();
      }, { threshold: 0.25 });
      io.observe(v);
    } else {
      play();
    }
    return () => {
      io?.disconnect();
      v.removeEventListener("loadedmetadata", set);
      v.removeEventListener("play", set);
      v.removeEventListener("seeked", set);
    };
  }, [speed, src, failed, active]);
  return (
    <>
      {fallback && <div className="absolute inset-0">{fallback}</div>}
      {!failed && (
        <video ref={ref} src={src} muted loop playsInline autoPlay={eager} preload={eager ? "metadata" : "none"}
          poster={poster} className={`absolute inset-0 h-full w-full object-cover ${className}`}
          onError={() => setFailed(true)} />
      )}
    </>
  );
}
