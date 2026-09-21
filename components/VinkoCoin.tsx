// La moneda de Vinko: círculo dorado con una V (marca). Reemplaza al 🪙 en
// toda la UI (saldo, nav, feed). SVG inline: cero peticiones, escala nítida.
export function VinkoCoin({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Vinkos"
      className={`inline-block align-[-0.15em] ${className}`.trim()}>
      <circle cx="16" cy="16" r="15" fill="#ffc23d" stroke="#e0a521" strokeWidth="2" />
      <circle cx="16" cy="16" r="11" fill="none" stroke="#e0a521" strokeWidth="1.2" opacity="0.6" />
      {/* brillo superior-izquierdo */}
      <path d="M7 12 A10 10 0 0 1 12 7" fill="none" stroke="#fff3c4" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      <path d="M10 10 L16 22 L22 10" fill="none" stroke="#0c1011" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
