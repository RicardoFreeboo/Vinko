// Mapa del grafo de flujo (spec de paneles §3). Posiciones 2.5D de los nodos y
// codificación evento → haz. Verde = normal, oro = alto valor, rojo = alerta.
export type NodeId =
  | "fuentes" | "agente" | "aprobacion" | "publicado"
  | "usuarios" | "porras" | "marcador" | "jugadores"
  | "push" | "anuncio" | "monedas" | "tienda";

export const NODES: { id: NodeId; x: number; y: number }[] = [
  { id: "fuentes", x: -6.5, y: 3.2 },
  { id: "agente", x: -2.2, y: 3.2 },
  { id: "aprobacion", x: 2.2, y: 3.2 },
  { id: "publicado", x: 6.5, y: 3.2 },
  { id: "usuarios", x: -6.5, y: 0 },
  { id: "porras", x: -2.2, y: 0 },
  { id: "marcador", x: 2.2, y: 0 },
  { id: "jugadores", x: 6.5, y: 0 },
  { id: "anuncio", x: -6.5, y: -3.2 },
  { id: "monedas", x: -2.2, y: -3.2 },
  { id: "tienda", x: 2.2, y: -3.2 },
  { id: "push", x: 6.5, y: -3.2 },
];

export const NODE_POS: Record<NodeId, [number, number]> = Object.fromEntries(
  NODES.map((n) => [n.id, [n.x, n.y]]),
) as Record<NodeId, [number, number]>;

// aristas base (líneas tenues siempre visibles)
export const EDGES: [NodeId, NodeId][] = [
  ["fuentes", "agente"], ["agente", "aprobacion"], ["aprobacion", "publicado"],
  ["usuarios", "porras"], ["porras", "marcador"], ["marcador", "jugadores"],
  ["anuncio", "monedas"], ["monedas", "tienda"], ["push", "jugadores"],
  ["publicado", "porras"], ["marcador", "push"],
];

export const GOLD = "#ffc23d";
export const GREEN = "#1fe07a";
export const RED = "#ff5a5a";

// color del haz por tipo de evento
export function beamColor(kind: string): string {
  if (kind === "publish" || kind === "resolve") return GOLD;
  if (kind === "alert") return RED;
  return GREEN;
}

export type Activity = {
  kind: string;
  from_node: string;
  to_node: string;
  magnitude: number;
  ts: string;
  label: string;
};
