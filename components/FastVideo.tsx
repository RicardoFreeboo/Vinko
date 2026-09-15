"use client";
import { useEffect, useRef } from "react";

// Vídeo de IA que reproduce más ágil (los clips Kling van algo lentos). Sube el
// playbackRate para que el feed se sienta dinámico, como el apk4. Reaplica el
// ritmo tras cada loop (algunos navegadores lo resetean).
export function FastVideo({ src, speed = 1.4, className, poster }: {
  src: string; speed?: number; className?: string; poster?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const set = () => { try { v.playbackRate = speed; } catch { /* noop */ } };
    set();
    v.addEventListener("loadedmetadata", set);
    v.addEventListener("play", set);
    v.addEventListener("seeked", set);
    return () => {
      v.removeEventListener("loadedmetadata", set);
      v.removeEventListener("play", set);
      v.removeEventListener("seeked", set);
    };
  }, [speed, src]);
  return <video ref={ref} src={src} autoPlay muted loop playsInline preload="metadata" poster={poster} className={className} />;
}
