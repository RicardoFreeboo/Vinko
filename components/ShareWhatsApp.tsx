"use client";
import { capture, type EventName } from "@/lib/analytics";

// Botón de compartir por WhatsApp FIABLE.
//
// Es un enlace real <a href="https://wa.me/?text=…"> y no un window.open():
// window.open lo anulan en silencio el bloqueador de ventanas, la app instalada
// (PWA) y los navegadores dentro de Instagram/Facebook. Un enlace de verdad
// abre WhatsApp siempre (app en el móvil, WhatsApp Web en el ordenador).
// Regla del freeze: solo wa.me con copy de lista blanca.
export function ShareWhatsApp({
  text, className, children, event = "porra_shared",
}: {
  text: string;
  className?: string;
  children: React.ReactNode;
  event?: EventName;
}) {
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => capture(event, { is_seed: false })}
      className={className}
    >
      {children}
    </a>
  );
}
