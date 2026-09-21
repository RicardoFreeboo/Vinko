// Banco evergreen del pique del día (R-04 del spec de lanzamiento).
// Genera el INSERT idempotente que vive embebido en
// supabase/migrations/0038_content_kpi.sql entre los marcadores
//   -- >>> EVERGREEN BANK   …   -- <<< EVERGREEN BANK
//
//   node scripts/evergreen-bank.mjs          → SQL por stdout, recuento por stderr
//   node scripts/evergreen-bank.mjs --write  → sustituye el bloque de la migración
//
// Reglas de cada fila (checklist del buen pique, R-04):
//   · se resuelve con un dato PÚBLICO y la fila dice cuál (criteria + source_url);
//   · 2–3 opciones cortas; pregunta ≤ 160 caracteres (check de daily_picks);
//   · no caduca: nada de fechas, jornadas ni nombres que dejen de existir
//     (los duelos de TV son la única excepción y van con peso bajo);
//   · months / dows acotan cuándo tiene sentido (umbral de temperatura por
//     estación, bolsa solo en días hábiles, duelo de TV solo lunes–jueves);
//   · cero léxico prohibido (scripts/lexicon-check.mjs vigila la migración).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(root, "supabase", "migrations", "0038_content_kpi.sql");
const OPEN = "-- >>> EVERGREEN BANK";
const CLOSE = "-- <<< EVERGREEN BANK";

const AEMET = "https://www.aemet.es/es/eltiempo/observacion/ultimosdatos";
const BME = "https://www.bolsasymercados.es/bme-exchange/es/Mercados-y-Cotizaciones/Acciones/Mercado-Continuo/Indices";
const ECB = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
const COINGECKO = "https://www.coingecko.com/es";
const BARLOVENTO = "https://www.barloventocomunicacion.es/audiencias-diarias/";
const OMIE = "https://www.omie.es/es/market-results/daily/daily-market/daily-hourly-price";
const SPOTIFY = "https://charts.spotify.com/charts/view/regional-es-daily/latest";
const YOUTUBE = "https://www.youtube.com/feed/trending?gl=ES";
const GTRENDS = "https://trends.google.es/trending?geo=ES";

// Estación AEMET de referencia por ciudad (la que sale en «Últimos datos»).
const CITIES = {
  Madrid: "Madrid-Retiro",
  Barcelona: "Barcelona (Aeropuerto)",
  Sevilla: "Sevilla (Aeropuerto)",
  Valencia: "Valencia (Viveros)",
  Bilbao: "Bilbao (Aeropuerto)",
  Zaragoza: "Zaragoza (Aeropuerto)",
  "Málaga": "Málaga (Aeropuerto)",
};

// Estaciones del año para los umbrales (meses ISO 1–12).
const SEASONS = {
  invierno: [12, 1, 2],
  primavera: [3, 4, 5],
  verano: [6, 7, 8, 9],
  "otoño": [10, 11],
};

// Umbral «¿pasa de N °C la máxima?» por ciudad y estación: pensado para que la
// respuesta sea incierta de verdad (cerca de la media climática de la máxima).
const MAX_THRESHOLDS = {
  Madrid:    { invierno: 13, primavera: 20, verano: 32, "otoño": 20 },
  Barcelona: { invierno: 15, primavera: 20, verano: 29, "otoño": 21 },
  Sevilla:   { invierno: 17, primavera: 25, verano: 36, "otoño": 25 },
  Valencia:  { invierno: 17, primavera: 22, verano: 30, "otoño": 23 },
  Bilbao:    { invierno: 13, primavera: 18, verano: 26, "otoño": 19 },
  Zaragoza:  { invierno: 12, primavera: 20, verano: 33, "otoño": 20 },
  "Málaga":  { invierno: 18, primavera: 22, verano: 30, "otoño": 23 },
};

// «¿Baja de N °C la mínima?» (solo invierno).
const MIN_THRESHOLDS = { Madrid: 0, Zaragoza: 0, Bilbao: 3, Barcelona: 3, Valencia: 5, Sevilla: 5, "Málaga": 7 };

// Racha máxima de viento (km/h) que hace de umbral por ciudad.
const WIND_THRESHOLDS = { Zaragoza: 50, Bilbao: 50, Valencia: 50, Barcelona: 50, "Málaga": 50, Madrid: 40 };

const WEEKDAYS = [1, 2, 3, 4, 5];

const rows = [];
const add = (r) => rows.push({ months: null, dows: null, weight: 1, ...r });

const aemetCrit = (city, what) =>
  `${what} en la estación de referencia de AEMET de ${city} (${CITIES[city]}). Fuente: aemet.es › Observación › Últimos datos (resumen del día).`;

// ---------- clima: lluvia mañana (7) ----------
for (const city of Object.keys(CITIES)) {
  add({
    question: `¿Llueve mañana en ${city}? (≥ 1 mm según AEMET)`,
    options: ["Llueve (≥ 1 mm)", "No llega a 1 mm"],
    criteria: aemetCrit(city, "Precipitación acumulada de MAÑANA (00:00–23:59) ≥ 1 mm"),
    category: "clima", weight: 3, source_url: AEMET,
  });
}

// ---------- clima: umbral de máxima por estación (7 × 4 = 28) ----------
// Si dos estaciones comparten umbral (p. ej. primavera y otoño en Madrid), es
// UNA fila con los meses de ambas: la pregunta es la clave única del banco.
for (const [city, th] of Object.entries(MAX_THRESHOLDS)) {
  const byThreshold = new Map();
  for (const [season, months] of Object.entries(SEASONS)) {
    const n = th[season];
    byThreshold.set(n, [...(byThreshold.get(n) ?? []), ...months]);
  }
  for (const [n, months] of byThreshold) {
    add({
      question: `¿Pasa de ${n} °C la máxima en ${city} mañana?`,
      options: ["Pasa", "No llega"],
      criteria: aemetCrit(city, `Temperatura máxima de MAÑANA estrictamente mayor que ${n},0 °C (${n},0 no pasa)`),
      category: "clima", weight: 2, months: [...months].sort((a, b) => a - b), source_url: AEMET,
    });
  }
}

// ---------- clima: duelos de máxima entre ciudades (10) ----------
const PAIRS = [
  ["Sevilla", "Madrid"], ["Barcelona", "Valencia"], ["Bilbao", "Zaragoza"], ["Madrid", "Barcelona"],
  ["Málaga", "Valencia"], ["Zaragoza", "Madrid"], ["Bilbao", "Barcelona"], ["Sevilla", "Málaga"],
  ["Valencia", "Madrid"], ["Zaragoza", "Sevilla"],
];
for (const [a, b] of PAIRS) {
  add({
    question: `¿Dónde hace más calor mañana: ${a} o ${b}? (máxima según AEMET)`,
    options: [a, b, "Empate"],
    criteria: `Máxima de MAÑANA de ${a} (${CITIES[a]}) frente a ${b} (${CITIES[b]}) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.`,
    category: "clima", weight: 2, source_url: AEMET,
  });
}

// ---------- clima: mañana frente a hoy (7) ----------
for (const city of Object.keys(CITIES)) {
  add({
    question: `¿Hace mañana más calor en ${city} que hoy? (máxima según AEMET)`,
    options: ["Más calor", "Igual o menos"],
    criteria: aemetCrit(city, "Máxima de MAÑANA estrictamente mayor que la máxima de HOY (en décimas)"),
    category: "clima", weight: 2, source_url: AEMET,
  });
}

// ---------- clima: mínimas de invierno (7) ----------
for (const [city, n] of Object.entries(MIN_THRESHOLDS)) {
  add({
    question: `¿Baja mañana de ${n} °C la mínima en ${city}?`,
    options: [`Baja de ${n} °C`, "Se queda por encima"],
    criteria: aemetCrit(city, `Temperatura mínima de MAÑANA estrictamente menor que ${n},0 °C`),
    category: "clima", weight: 2, months: SEASONS.invierno, source_url: AEMET,
  });
}

// ---------- clima: noches tropicales (5) ----------
const TROPICAL = { Sevilla: [6, 7, 8, 9], Valencia: [6, 7, 8, 9], "Málaga": [6, 7, 8, 9], Barcelona: [7, 8], Madrid: [7, 8] };
for (const [city, months] of Object.entries(TROPICAL)) {
  add({
    question: `¿Noche tropical mañana en ${city}? (mínima de 20 °C o más según AEMET)`,
    options: ["Sí, 20 °C o más", "No, baja de 20 °C"],
    criteria: aemetCrit(city, "Temperatura mínima de MAÑANA ≥ 20,0 °C"),
    category: "clima", weight: 2, months, source_url: AEMET,
  });
}

// ---------- clima: viento (6) ----------
for (const [city, n] of Object.entries(WIND_THRESHOLDS)) {
  add({
    question: `¿Racha de viento de ${n} km/h o más mañana en ${city}? (según AEMET)`,
    options: ["Sí", "No"],
    criteria: aemetCrit(city, `Racha máxima de viento de MAÑANA ≥ ${n} km/h`),
    category: "clima", weight: 1, source_url: AEMET,
  });
}

// ---------- clima: extremos nacionales y lluvia repartida (3) ----------
add({
  question: "¿Está mañana la máxima más alta entre capitales de provincia en Andalucía? (según AEMET)",
  options: ["Andalucía", "Otra comunidad"],
  criteria: "Capital de provincia con la temperatura máxima más alta de MAÑANA en el resumen de extremos de AEMET. Fuente: aemet.es › Observación › Últimos datos › capitales.",
  category: "clima", weight: 1, source_url: AEMET,
});
add({
  question: "¿Está mañana la mínima más baja entre capitales de provincia en Castilla y León? (según AEMET)",
  options: ["Castilla y León", "Otra comunidad"],
  criteria: "Capital de provincia con la temperatura mínima más baja de MAÑANA en el resumen de extremos de AEMET. Fuente: aemet.es › Observación › Últimos datos › capitales.",
  category: "clima", weight: 1, source_url: AEMET,
});
add({
  question: "¿Llueve mañana (≥ 1 mm) en al menos 3 de estas 7 ciudades: Madrid, Barcelona, Sevilla, Valencia, Bilbao, Zaragoza y Málaga?",
  options: ["3 o más", "Menos de 3"],
  criteria: "Número de estas ciudades con precipitación acumulada de MAÑANA ≥ 1 mm en su estación de referencia de AEMET. Fuente: aemet.es › Observación › Últimos datos.",
  category: "clima", weight: 1, source_url: AEMET,
});

// ---------- bolsa (10, solo días hábiles) ----------
const bmeCrit = (what) => `${what}. Cierre oficial de la sesión de HOY frente al cierre anterior, según BME. Si la bolsa no abre (festivo), se anula el pique. Fuente: bolsasymercados.es.`;
add({ question: "¿Cierra hoy el IBEX 35 en verde?", options: ["Sube", "Baja"], criteria: bmeCrit("IBEX 35 cierra por encima del cierre anterior"), category: "bolsa", weight: 4, dows: WEEKDAYS, source_url: BME });
add({ question: "¿Se mueve hoy el IBEX 35 más de un 1 % (arriba o abajo)?", options: ["Más de 1 %", "1 % o menos"], criteria: bmeCrit("Variación del IBEX 35 en valor absoluto > 1,00 %"), category: "bolsa", weight: 2, dows: WEEKDAYS, source_url: BME });
add({ question: "¿Cierra hoy el IBEX 35 por encima de su apertura?", options: ["Por encima", "Por debajo o igual"], criteria: bmeCrit("Cierre del IBEX 35 estrictamente mayor que su apertura de HOY"), category: "bolsa", weight: 1, dows: WEEKDAYS, source_url: BME });
add({ question: "¿Sube hoy Inditex en bolsa?", options: ["Sube", "Baja"], criteria: bmeCrit("Inditex (ITX) cierra por encima del cierre anterior"), category: "bolsa", weight: 1, dows: WEEKDAYS, source_url: BME });
add({ question: "¿Sube hoy Banco Santander en bolsa?", options: ["Sube", "Baja"], criteria: bmeCrit("Banco Santander (SAN) cierra por encima del cierre anterior"), category: "bolsa", weight: 1, dows: WEEKDAYS, source_url: BME });
add({
  question: "¿Cierra hoy el EURO STOXX 50 en verde?", options: ["Sube", "Baja"],
  criteria: "EURO STOXX 50 cierra HOY por encima del cierre anterior (cierre 17:50 hora de Madrid). Festivo europeo = se anula. Fuente: stoxx.com.",
  category: "bolsa", weight: 2, dows: WEEKDAYS, source_url: "https://www.stoxx.com/index/sx5e/",
});
add({
  question: "¿Cierra hoy Wall Street (S&P 500) en verde?", options: ["Sube", "Baja"],
  criteria: "S&P 500 cierra HOY por encima del cierre anterior (cierre 22:00 hora de Madrid, 21:00 con horario de invierno de EE. UU. desfasado). Festivo en EE. UU. = se anula. Fuente: spglobal.com.",
  category: "bolsa", weight: 2, dows: WEEKDAYS, source_url: "https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
});
add({
  question: "¿Cierra hoy el Nasdaq 100 en verde?", options: ["Sube", "Baja"],
  criteria: "Nasdaq 100 cierra HOY por encima del cierre anterior (cierre 22:00 hora de Madrid). Festivo en EE. UU. = se anula. Fuente: nasdaq.com.",
  category: "bolsa", weight: 1, dows: WEEKDAYS, source_url: "https://www.nasdaq.com/market-activity/index/ndx",
});
add({
  question: "¿Sube hoy el barril de Brent?", options: ["Sube", "Baja"],
  criteria: "Precio de cierre del Brent (primer vencimiento, ICE) de HOY por encima del cierre anterior. Fuente: ice.com › Brent Crude Futures.",
  category: "bolsa", weight: 1, dows: WEEKDAYS, source_url: "https://www.ice.com/products/219/Brent-Crude-Futures/data",
});
add({
  question: "¿Sube hoy el oro?", options: ["Sube", "Baja"],
  criteria: "Fixing de la tarde del oro (LBMA PM, en USD/onza) de HOY por encima del de la sesión anterior. Fuente: lbma.org.uk › Precious Metal Prices.",
  category: "bolsa", weight: 1, dows: WEEKDAYS, source_url: "https://www.lbma.org.uk/prices-and-data/precious-metal-prices",
});

// ---------- euro/dólar (8, referencia BCE de días hábiles) ----------
add({
  question: "¿Sube hoy el euro frente al dólar? (tipo de referencia del BCE)", options: ["Sube", "Baja"],
  criteria: "Tipo de referencia EUR/USD del BCE publicado HOY (~16:00 CET) mayor que el del día hábil anterior. Sin publicación (festivo TARGET) = se anula. Fuente: ecb.europa.eu.",
  category: "divisas", weight: 3, dows: WEEKDAYS, source_url: ECB,
});
for (const level of ["1,05", "1,08", "1,10", "1,12", "1,15", "1,18", "1,20"]) {
  add({
    question: `¿Está hoy el euro por encima de ${level} $? (tipo de referencia del BCE)`,
    options: ["Por encima", "Por debajo"],
    criteria: `Tipo de referencia EUR/USD del BCE publicado HOY (~16:00 CET) estrictamente mayor que ${level}00. Sin publicación (festivo TARGET) = se anula. Fuente: ecb.europa.eu.`,
    category: "divisas", weight: 1, dows: WEEKDAYS, source_url: ECB,
  });
}

// ---------- cripto (7, cualquier día) ----------
const cgCrit = (what) => `${what}, tomado a las 23:00 hora de Madrid en CoinGecko (precio en USD). Fuente: coingecko.com.`;
add({ question: "¿Vale más Bitcoin hoy a las 23:00 que ayer a esa hora?", options: ["Sube", "Baja"], criteria: cgCrit("Precio de Bitcoin de HOY mayor que el de AYER a la misma hora"), category: "cripto", weight: 3, source_url: COINGECKO });
add({ question: "¿Vale más Ethereum hoy a las 23:00 que ayer a esa hora?", options: ["Sube", "Baja"], criteria: cgCrit("Precio de Ethereum de HOY mayor que el de AYER a la misma hora"), category: "cripto", weight: 2, source_url: COINGECKO });
add({ question: "¿Se mueve Bitcoin hoy más de un 2 % respecto a ayer? (a las 23:00)", options: ["Más de 2 %", "2 % o menos"], criteria: cgCrit("Variación de Bitcoin en 24 h en valor absoluto > 2,00 %"), category: "cripto", weight: 1, source_url: COINGECKO });
add({ question: "¿Sube hoy Bitcoin más que Ethereum? (variación 24 h a las 23:00)", options: ["Bitcoin", "Ethereum"], criteria: cgCrit("Variación en 24 h de Bitcoin mayor que la de Ethereum (en puntos porcentuales)"), category: "cripto", weight: 2, source_url: COINGECKO });
for (const level of ["80.000", "100.000", "150.000"]) {
  add({
    question: `¿Está Bitcoin por encima de ${level} $ hoy a las 23:00?`, options: ["Por encima", "Por debajo"],
    criteria: cgCrit(`Precio de Bitcoin estrictamente mayor que ${level} USD`), category: "cripto", weight: 1, source_url: COINGECKO,
  });
}

// ---------- audiencias de TV (10, dato oficial de la mañana siguiente) ----------
const tvCrit = (what) => `${what}, según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.`;
add({ question: "¿Gana hoy El Hormiguero a La Revuelta en audiencia?", options: ["El Hormiguero", "La Revuelta"], criteria: tvCrit("Espectadores medios de El Hormiguero (Antena 3) mayores que los de La Revuelta (La 1) en la emisión de HOY"), category: "tv", weight: 4, dows: [1, 2, 3], source_url: BARLOVENTO });
add({ question: "¿Gana El Hormiguero a La Revuelta este jueves en audiencia?", options: ["El Hormiguero", "La Revuelta"], criteria: tvCrit("Espectadores medios de El Hormiguero (Antena 3) mayores que los de La Revuelta (La 1) en la emisión del JUEVES"), category: "tv", weight: 4, dows: [4], source_url: BARLOVENTO });
add({ question: "¿Supera hoy El Hormiguero el 15 % de share?", options: ["Supera", "No llega"], criteria: tvCrit("Share de El Hormiguero (Antena 3) de HOY estrictamente mayor que 15,0 %"), category: "tv", weight: 1, dows: [1, 2, 3, 4], source_url: BARLOVENTO });
add({ question: "¿Supera hoy La Revuelta el 12 % de share?", options: ["Supera", "No llega"], criteria: tvCrit("Share de La Revuelta (La 1) de HOY estrictamente mayor que 12,0 %"), category: "tv", weight: 1, dows: [1, 2, 3, 4], source_url: BARLOVENTO });
add({ question: "¿Es hoy Antena 3 la cadena más vista del día?", options: ["Antena 3", "Otra cadena"], criteria: tvCrit("Cadena con mayor share del día completo de HOY"), category: "tv", weight: 3, source_url: BARLOVENTO });
add({ question: "¿Gana hoy Antena 3 a Telecinco en share del día?", options: ["Antena 3", "Telecinco"], criteria: tvCrit("Share del día completo de HOY de Antena 3 mayor que el de Telecinco"), category: "tv", weight: 2, source_url: BARLOVENTO });
add({ question: "¿Es hoy La 1 la segunda cadena más vista del día?", options: ["Sí", "No"], criteria: tvCrit("La 1 ocupa el segundo puesto por share del día completo de HOY"), category: "tv", weight: 1, source_url: BARLOVENTO });
add({ question: "¿Supera hoy el programa más visto del día los 2 millones de espectadores?", options: ["Sí", "No"], criteria: tvCrit("Espectadores medios del programa más visto de HOY (sin contar retransmisiones deportivas) > 2.000.000"), category: "tv", weight: 2, source_url: BARLOVENTO });
add({ question: "¿Es un informativo el programa más visto de hoy?", options: ["Un informativo", "Otro programa"], criteria: tvCrit("El programa con más espectadores medios de HOY es una edición de informativos (sin contar retransmisiones deportivas)"), category: "tv", weight: 1, source_url: BARLOVENTO });
add({ question: "¿Gana hoy Antena 3 Noticias 1 a Informativos Telecinco 15:00 en audiencia?", options: ["Antena 3", "Telecinco"], criteria: tvCrit("Espectadores medios de Antena 3 Noticias 1 (15:00) mayores que los de Informativos Telecinco 15:00 en la emisión de HOY"), category: "tv", weight: 1, source_url: BARLOVENTO });

// ---------- precio de la luz (3, OMIE publica mañana hoy a las 13:00) ----------
add({
  question: "¿Es mañana la luz más cara que hoy? (precio medio diario del mercado mayorista)", options: ["Más cara", "Más barata"],
  criteria: "Precio medio diario del mercado mayorista (OMIE, España) de MAÑANA mayor que el de HOY. Se publica hoy a las ~13:00. Fuente: omie.es › Resultados del mercado diario.",
  category: "energia", weight: 3, source_url: OMIE,
});
add({
  question: "¿Supera mañana los 100 €/MWh el precio medio de la luz en el mercado mayorista?", options: ["Supera", "No llega"],
  criteria: "Precio medio diario del mercado mayorista (OMIE, España) de MAÑANA estrictamente mayor que 100,00 €/MWh. Fuente: omie.es.",
  category: "energia", weight: 1, source_url: OMIE,
});
add({
  question: "¿Cae la hora más cara de la luz de mañana después de las 19:00?", options: ["Después de las 19:00", "Antes de las 19:00"],
  criteria: "Hora con el precio horario más alto del mercado mayorista (OMIE, España) de MAÑANA: 19:00–23:59 = «Después», 00:00–18:59 = «Antes». Fuente: omie.es.",
  category: "energia", weight: 1, source_url: OMIE,
});

// ---------- música e internet (5) ----------
add({ question: "¿Sigue mañana la misma canción en el nº 1 de Spotify España? (Top 50 diario)", options: ["Sigue", "Cambia"], criteria: "Canción nº 1 del Top 50 diario de Spotify España de MAÑANA igual a la de HOY. Fuente: charts.spotify.com (regional-es-daily).", category: "musica", weight: 2, source_url: SPOTIFY });
add({ question: "¿Es en español el nº 1 de Spotify España mañana? (Top 50 diario)", options: ["En español", "En otro idioma"], criteria: "Idioma principal de la letra del nº 1 del Top 50 diario de Spotify España de MAÑANA. Fuente: charts.spotify.com (regional-es-daily).", category: "musica", weight: 1, source_url: SPOTIFY });
add({ question: "¿Es un vídeo musical el nº 1 de tendencias de YouTube España mañana a las 12:00?", options: ["Musical", "Otro tipo"], criteria: "Primer vídeo de la pestaña Tendencias de YouTube España consultada MAÑANA a las 12:00 (hora de Madrid), sin sesión iniciada. Fuente: youtube.com/feed/trending?gl=ES.", category: "internet", weight: 1, source_url: YOUTUBE });
add({ question: "¿Supera el millón de visitas el nº 1 de tendencias de YouTube España mañana a las 12:00?", options: ["Sí", "No"], criteria: "Visitas del primer vídeo de Tendencias de YouTube España consultadas MAÑANA a las 12:00 (hora de Madrid) > 1.000.000. Fuente: youtube.com/feed/trending?gl=ES.", category: "internet", weight: 1, source_url: YOUTUBE });
add({ question: "¿Es una persona la búsqueda nº 1 de Google Trends España hoy?", options: ["Una persona", "Otra cosa"], criteria: "Primera entrada de Tendencias de búsqueda de Google Trends (España, últimas 24 h) consultada HOY a las 23:00 hora de Madrid: nombre de una persona = «Una persona». Fuente: trends.google.es/trending?geo=ES.", category: "internet", weight: 1, source_url: GTRENDS });

// ---------- validación ----------
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (a) => (a && a.length ? `'{${a.join(",")}}'::smallint[]` : "null");
const seen = new Set();
for (const r of rows) {
  if (r.question.length < 5 || r.question.length > 160) throw new Error(`pregunta fuera de 5–160: ${r.question}`);
  if (r.options.length < 2 || r.options.length > 3) throw new Error(`opciones fuera de 2–3: ${r.question}`);
  if (seen.has(r.question)) throw new Error(`pregunta duplicada: ${r.question}`);
  seen.add(r.question);
  if (!r.criteria || !r.source_url) throw new Error(`sin criterio/fuente: ${r.question}`);
}

const values = rows.map((r) =>
  `  (${q(r.question)}, ${q(JSON.stringify(r.options))}::jsonb, ${q(r.criteria)}, ${q(r.category)}, ${r.weight}, ${arr(r.months)}, ${arr(r.dows)}, ${q(r.source_url)})`,
);
const sql = [
  `-- ${rows.length} filas generadas por scripts/evergreen-bank.mjs (no editar a mano: regenerar con --write)`,
  "insert into public.evergreen_bank (question, options, criteria, category, weight, months, dows, source_url) values",
  values.join(",\n"),
  "on conflict (question) do nothing;",
].join("\n");

if (process.argv.includes("--write")) {
  const src = readFileSync(MIGRATION, "utf8");
  const a = src.indexOf(OPEN);
  const b = src.indexOf(CLOSE);
  if (a < 0 || b < 0 || b < a) throw new Error(`marcadores ${OPEN} / ${CLOSE} no encontrados en ${MIGRATION}`);
  const out = src.slice(0, a + OPEN.length) + "\n" + sql + "\n" + src.slice(b);
  writeFileSync(MIGRATION, out);
  console.error(`✓ ${rows.length} filas escritas en ${MIGRATION}`);
} else {
  process.stdout.write(sql + "\n");
  console.error(`✓ ${rows.length} filas evergreen (${[...new Set(rows.map((r) => r.category))].join(", ")})`);
}
