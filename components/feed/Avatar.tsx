// Avatar redondo: foto si la hay, si no las dos primeras letras del handle
// (mismo criterio que PorraSocial). Sirve en servidor y en cliente.
export function Avatar({ handle, url, size = 28, ring = false }: {
  handle: string; url: string | null; size?: number; ring?: boolean;
}) {
  const cls = ring ? "ring-2 ring-white/85" : "";
  if (url) {
    return (
      <img src={url} alt="" width={size} height={size}
        className={`rounded-full object-cover ${cls}`} style={{ width: size, height: size }} />
    );
  }
  return (
    <span className={`grid place-items-center rounded-full bg-[var(--ink3)] font-black text-[var(--win)] ${cls}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {handle.slice(0, 2).toUpperCase()}
    </span>
  );
}
