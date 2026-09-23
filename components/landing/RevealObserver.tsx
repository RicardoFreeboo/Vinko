"use client";
import { useEffect } from "react";

// Aparición al hacer scroll para los [data-reveal] de la portada. Lo que ya se
// ve al cargar se marca antes de armar la clase → sin parpadeo. Sin JS (o sin
// IntersectionObserver) todo queda visible porque .lx-armed nunca se pone.
export function RevealObserver() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lx");
    if (!root || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const vh = window.innerHeight;
    for (const el of els) if (el.getBoundingClientRect().top < vh * 0.92) el.dataset.in = "1";
    root.classList.add("lx-armed");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.in = "1";
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    for (const el of els) if (el.dataset.in !== "1") io.observe(el);
    return () => io.disconnect();
  }, []);
  return null;
}
