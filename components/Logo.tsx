// Logo Vinko REAL (vmark de vinko4.apk): bocadillo crema + check verde + corona
// dorada, con el wordmark "vinko" (v verde). Reutilizable, server-safe.

export function VMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Vinko"
    >
      <path d="M55 22 L59 11 L66 17 L72 8 L78 17 L85 11 L89 22 Z" fill="#ffc23d" />
      <path
        d="M50 25 C30 25 17 37 17 52 C17 63 23 72 34 77 L30 89 L46 78 Q48 78.4 50 78.4 C70 78.4 83 66 83 51 C83 37 70 25 50 25 Z"
        fill="none"
        stroke="#f4f1e9"
        strokeWidth={5}
      />
      <path
        d="M35 52 L46 66 L70 38"
        fill="none"
        stroke="#1fe07a"
        strokeWidth={11}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span
      style={{ fontSize: size }}
      className="font-black tracking-tight text-[var(--cream)]"
    >
      <span className="text-[var(--win)]">v</span>inko
    </span>
  );
}

export function Logo({ mark = 30, word = 22 }: { mark?: number; word?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <VMark size={mark} />
      <Wordmark size={word} />
    </span>
  );
}
