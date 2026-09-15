// La moneda de Vinko: círculo dorado con una V (marca). Reemplaza al 🪙.
export function VinkoCoin({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Vinko" className="inline-block align-[-0.15em]">
      <circle cx="16" cy="16" r="15" fill="#ffc23d" stroke="#e0a521" strokeWidth="2" />
      <circle cx="16" cy="16" r="11" fill="none" stroke="#e0a521" strokeWidth="1.2" opacity="0.6" />
      <path d="M10 10 L16 22 L22 10" fill="none" stroke="#0c1011" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
