// Moneda Vinko en 3D con CSS: capas apiladas en Z hacen el canto con grosor y
// las dos caras usan el mismo SVG de VinkoCoin. Gira sola (app/landing.css).
// Decorativa: aria-hidden. Server-safe (sin estado).
const LAYERS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

function Face() {
  return (
    <svg viewBox="0 0 32 32">
      <defs>
        <radialGradient id="lxCoinG" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffe29a" />
          <stop offset="0.45" stopColor="#ffc23d" />
          <stop offset="1" stopColor="#d99b1e" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15.5" fill="url(#lxCoinG)" stroke="#c98a14" strokeWidth="1" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="#b98014" strokeWidth="1" opacity="0.7" />
      <path d="M7 12 A10 10 0 0 1 12 7" fill="none" stroke="#fff6d6" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
      <path d="M10 10 L16 22 L22 10" fill="none" stroke="#0c1011" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Coin3D({ size = 72 }: { size?: number }) {
  const half = 4.5 * (size / 72);
  return (
    <div aria-hidden className="lx-coin-wrap">
      <div className="lx-coin" style={{ ["--s" as string]: `${size}px` }}>
        {LAYERS.map((z) => (
          <i key={z} style={{ transform: `translateZ(${z * (size / 72)}px)` }} />
        ))}
        <div className="lx-coin-face" style={{ transform: `translateZ(${half}px)` }}>
          <Face />
        </div>
        <div className="lx-coin-face" style={{ transform: `rotateY(180deg) translateZ(${half}px)` }}>
          <Face />
        </div>
      </div>
    </div>
  );
}
