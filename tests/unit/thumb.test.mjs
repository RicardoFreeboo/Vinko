// lib/thumb.ts — thumbOf(video): miniatura JPG al lado del vídeo, o null.
import { test, assert, loadTs } from "./_harness.mjs";

const { thumbOf } = await loadTs("lib/thumb.ts");

const CASES = [
  // [entrada, salida esperada]
  ["/v/clasico-liga.webm", "/v/clasico-liga.thumb.jpg"],
  ["https://uarnpxjdccbidgzhhavc.supabase.co/storage/v1/object/public/porra-media/agent/alonso-puntos.mp4",
    "https://uarnpxjdccbidgzhhavc.supabase.co/storage/v1/object/public/porra-media/agent/alonso-puntos.thumb.jpg"],
  ["/u/nota.mov", "/u/nota.thumb.jpg"],
  ["/u/clip.m4v", "/u/clip.thumb.jpg"],
  ["/v/a.webm?token=abc&x=1", "/v/a.thumb.jpg"],
  ["/v/MAYUS.WEBM", "/v/MAYUS.thumb.jpg"],
  [null, null],
  [undefined, null],
  ["", null],
  ["/img/foto.jpg", null],
  ["/img/foto.png", null],
  ["/v/a.webm.png", null],
  ["/u/nota-de-voz.mp3", null],
  ["/u/nota-de-voz.webm.ogg", null],
];

for (const [input, expected] of CASES) {
  await test(`thumbOf(${JSON.stringify(input)}) → ${JSON.stringify(expected)}`, () => {
    assert.equal(thumbOf(input), expected);
  });
}
