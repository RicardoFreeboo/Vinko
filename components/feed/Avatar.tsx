// Avatar redondo: foto si la hay; si no, la inicial del handle en crema sobre
// un color apagado fijo por persona (VINKO_PANTALLAS: .av). Sirve en servidor
// y en cliente.
const PALETTE = [
  "#9b5a7a", "#3d6e9e", "#4e7fa3", "#8a7238", "#7a4f8a", "#6a5a9b",
  "#5e6b8a", "#4f6a8a", "#8a6a7a", "#8a4f5e", "#8a5a4a", "#7a6a4f", "#4f8a7a",
];

// Mismo handle → mismo color en todas las pantallas.
export function avatarColor(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

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
    <span className={`grid shrink-0 place-items-center rounded-full font-bold text-[var(--cream)] ${cls}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: avatarColor(handle) }}>
      {handle.slice(0, 1).toUpperCase()}
    </span>
  );
}
