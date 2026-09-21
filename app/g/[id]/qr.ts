// Codificador QR sin dependencias (ISO 18004): modo byte, corrección M,
// versiones 1–10 (hasta 213 bytes: de sobra para el enlace de invitación).
// Devuelve el tamaño en módulos y un path SVG con los módulos oscuros, para
// pintarlo en servidor sin JS ni paquetes nuevos. Se elige la máscara con la
// penalización estándar (reglas 1–4) para que cualquier cámara lo lea.

type Blocks = [number, number][]; // [bloques, bytes de datos por bloque]
// Nivel M: [códigos EC por bloque, grupos de bloques]
const EC_M: Record<number, [number, Blocks]> = {
  1: [10, [[1, 16]]],
  2: [16, [[1, 28]]],
  3: [26, [[1, 44]]],
  4: [18, [[2, 32]]],
  5: [24, [[2, 43]]],
  6: [16, [[4, 27]]],
  7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]],
};
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], // último centro = tamaño − 7
};

// ---------- GF(256) y Reed–Solomon ----------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(n: number): number[] {
  let g = [1]; // coeficientes de mayor a menor grado
  for (let i = 0; i < n; i++) {
    const ng = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = ng;
  }
  return g;
}

function rsEncode(data: Uint8Array, n: number): Uint8Array {
  const g = rsGenerator(n);
  const res = new Uint8Array(data.length + n);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const c = res[i];
    if (!c) continue;
    for (let j = 1; j < g.length; j++) res[i + j] ^= mul(g[j], c);
  }
  return res.slice(data.length);
}

// ---------- datos → códigos (bloques + intercalado) ----------
function dataCodewords(version: number): number {
  return EC_M[version][1].reduce((s, [n, len]) => s + n * len, 0);
}

function pickVersion(len: number): number {
  for (let v = 1; v <= 10; v++) {
    const cap = dataCodewords(v) - (v < 10 ? 2 : 3); // 4 bits modo + contador
    if (len <= cap) return v;
  }
  throw new Error("QR: texto demasiado largo");
}

function encodeCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const total = dataCodewords(version);
  const bits: number[] = [];
  const push = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0); // terminador
  while (bits.length % 8) bits.push(0);
  const data = new Uint8Array(total);
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data[i / 8] = b;
  }
  for (let i = bits.length / 8, k = 0; i < total; i++, k++) data[i] = k % 2 ? 0x11 : 0xec;

  const [ecN, groups] = EC_M[version];
  const blocks: Uint8Array[] = [];
  let off = 0;
  for (const [n, len] of groups) {
    for (let i = 0; i < n; i++) { blocks.push(data.slice(off, off + len)); off += len; }
  }
  const ecs = blocks.map((b) => rsEncode(b, ecN));
  const out: number[] = [];
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecN; i++) for (const e of ecs) out.push(e[i]);
  return Uint8Array.from(out);
}

// ---------- matriz ----------
class Matrix {
  size: number;
  dark: Uint8Array;
  func: Uint8Array; // módulos de función (no llevan datos ni máscara)
  constructor(size: number) {
    this.size = size;
    this.dark = new Uint8Array(size * size);
    this.func = new Uint8Array(size * size);
  }
  set(r: number, c: number, d: boolean, fn = true) {
    const i = r * this.size + c;
    this.dark[i] = d ? 1 : 0;
    if (fn) this.func[i] = 1;
  }
  get(r: number, c: number) { return this.dark[r * this.size + c] === 1; }
  isFunc(r: number, c: number) { return this.func[r * this.size + c] === 1; }
}

function drawFinder(m: Matrix, r0: number, c0: number) {
  for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
    const rr = r0 + r, cc = c0 + c;
    if (rr < 0 || cc < 0 || rr >= m.size || cc >= m.size) continue;
    const d = Math.max(Math.abs(r - 3), Math.abs(c - 3));
    m.set(rr, cc, d !== 2 && d !== 4);
  }
}

function drawAlignment(m: Matrix, r0: number, c0: number) {
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
    m.set(r0 + r, c0 + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  }
}

function drawFunctionPatterns(m: Matrix, version: number) {
  const n = m.size;
  for (let i = 8; i < n - 8; i++) { m.set(6, i, i % 2 === 0); m.set(i, 6, i % 2 === 0); }
  drawFinder(m, 0, 0); drawFinder(m, 0, n - 7); drawFinder(m, n - 7, 0);
  const al = ALIGN[version];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    const corner = (i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0);
    if (!corner) drawAlignment(m, al[i], al[j]);
  }
  drawFormat(m, 0); // reserva (se reescribe con la máscara elegida)
  if (version >= 7) drawVersion(m, version);
}

function drawFormat(m: Matrix, mask: number) {
  const n = m.size;
  const data = (0b00 << 3) | mask; // nivel M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m.set(i, 8, bit(i));
  m.set(7, 8, bit(6)); m.set(8, 8, bit(7)); m.set(8, 7, bit(8));
  for (let i = 9; i <= 14; i++) m.set(8, 14 - i, bit(i));
  for (let i = 0; i <= 7; i++) m.set(8, n - 1 - i, bit(i));
  for (let i = 8; i <= 14; i++) m.set(n - 15 + i, 8, bit(i));
  m.set(n - 8, 8, true); // módulo oscuro fijo
}

function drawVersion(m: Matrix, version: number) {
  const n = m.size;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const b = ((bits >>> i) & 1) === 1;
    const a = n - 11 + (i % 3), c = Math.floor(i / 3);
    m.set(c, a, b); m.set(a, c, b);
  }
}

function placeData(m: Matrix, cw: Uint8Array) {
  const n = m.size;
  let bi = 0;
  const total = cw.length * 8;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const up = ((right + 1) & 2) === 0;
        const r = up ? n - 1 - v : v;
        if (m.isFunc(r, c)) continue;
        const b = bi < total ? ((cw[bi >>> 3] >>> (7 - (bi & 7))) & 1) === 1 : false;
        m.set(r, c, b, false);
        bi++;
      }
    }
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(m: Matrix, k: number) {
  const f = MASKS[k];
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) {
    if (!m.isFunc(r, c) && f(r, c)) m.dark[r * m.size + c] ^= 1;
  }
}

// Penalización estándar (reglas 1–4) para elegir máscara: runs ≥ 5, bloques
// 2×2, patrones parecidos al buscador (1:1:3:1:1 con 4 claros) y proporción
// de oscuros.
function finderCount(h: number[]): number {
  const n = h[1];
  const core = n > 0 && h[2] === n && h[3] === 3 * n && h[4] === n && h[5] === n;
  return (core && h[0] >= 4 * n && h[6] >= n ? 1 : 0) + (core && h[6] >= 4 * n && h[0] >= n ? 1 : 0);
}
function penalty(m: Matrix): number {
  const n = m.size;
  let p = 0;
  const scan = (get: (i: number) => boolean) => {
    let color = false, run = 0;
    const hist = [0, 0, 0, 0, 0, 0, 0];
    const add = (len: number) => { if (hist[0] === 0) len += n; hist.pop(); hist.unshift(len); };
    for (let i = 0; i < n; i++) {
      if (get(i) === color) {
        run++;
        if (run === 5) p += 3; else if (run > 5) p++;
      } else {
        add(run);
        if (!color) p += finderCount(hist) * 40;
        color = get(i); run = 1;
      }
    }
    if (color) { add(run); run = 0; }
    add(run + n);
    p += finderCount(hist) * 40;
  };
  for (let r = 0; r < n; r++) scan((i) => m.get(r, i));
  for (let c = 0; c < n; c++) scan((i) => m.get(i, c));
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const a = m.get(r, c);
    if (a === m.get(r, c + 1) && a === m.get(r + 1, c) && a === m.get(r + 1, c + 1)) p += 3;
  }
  let dark = 0;
  for (let i = 0; i < m.dark.length; i++) dark += m.dark[i];
  const total = n * n;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return p + k * 10;
}

/** Codifica `text` (UTF-8) y devuelve {size, path} para un <svg viewBox="0 0 size size">. */
export function qrSvg(text: string): { size: number; path: string; version: number } {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const size = 17 + 4 * version;
  const cw = encodeCodewords(bytes, version);

  const base = new Matrix(size);
  drawFunctionPatterns(base, version);
  placeData(base, cw);

  let best: Matrix | null = null;
  let bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    const m = new Matrix(size);
    m.dark.set(base.dark); m.func.set(base.func);
    applyMask(m, k);
    drawFormat(m, k);
    const s = penalty(m);
    if (s < bestScore) { bestScore = s; best = m; }
  }
  const m = best as Matrix;

  // runs horizontales → path corto
  let path = "";
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!m.get(r, c)) { c++; continue; }
      let len = 1;
      while (c + len < size && m.get(r, c + len)) len++;
      path += `M${c} ${r}h${len}v1h-${len}z`;
      c += len;
    }
  }
  return { size, path, version };
}
