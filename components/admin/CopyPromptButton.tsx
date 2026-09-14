"use client";
import { useState } from "react";

// Botón "Copiar prompt Claude" del panel de estado (PASO 5b): copia una plantilla
// de diagnóstico para pegar en Claude Code sin salirse del ALPHA FREEZE.
export function CopyPromptButton({
  labelCopy,
  labelCopied,
}: {
  labelCopy: string;
  labelCopied: string;
}) {
  const [done, setDone] = useState(false);
  const prompt = [
    "Vinko — diagnóstico. Pieza: <nombre>. Síntoma: <qué falla>.",
    "Último log: <pega aquí>.",
    "No toques la capa 2 ni la compra de puntos. Arregla solo eso.",
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* clipboard bloqueado: sin ruido */
    }
  }

  return (
    <button
      onClick={copy}
      className="mono rounded-full border border-[var(--win)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--win)]"
    >
      {done ? labelCopied : labelCopy}
    </button>
  );
}
