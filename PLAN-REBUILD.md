# VINKO — Plan maestro del rebuild (handoff)

> **Qué es:** el índice ordenado de TODO el rebuild solo-puntos y su estado. Punto de entrada para ejecutar en sesiones de Claude Code. Última actualización: 25-oct-2026, rama `claude/solo-puntos`.
>
> **Guardrails (leer siempre):** `REGLAS-LEGALES.md` (invariantes legales, manda sobre todo) y `CLAUDE.md`. CI debe correr léxico + invariante de esquema.
>
> **Orden de autoridad de specs** (si chocan): esta lista de abajo > spec de mercados/agente > `VINKO_PRODUCT_SPEC.md` > doc de diseño > `AUDITORIA-VINKO.md`. `CONTEXTO-VINKO.md` está desactualizado.

## A. Hecho en esta sesión (rama `claude/solo-puntos`, verde y pusheado)

- **A** — Subsistema de dinero fuera del build (72 ficheros).
- **B1** — Dinero fuera de la BD (migración `0060`: 16 tablas, columnas, ~36 RPCs).
- **B2** — Reto sin premio (migración `0061`: núcleo redefinido, `stake_kind`/`stake_text` fuera).
- **C.1** — Edad 18 (migración `0062` + cliente + copy) y nav sin el 404 de Cartera.
- **C.2** — Racha = **votar** (`0063` elimina `daily_open()`; votar y el regalo ya tocaban racha) + **captura de UTM** de primer toque (atribución, solo a PostHog con consentimiento).
- **§12 higiene** — fuera `legacy-web-v1/`, `vinko-static.zip`, `netlify.toml`, `TemasBoard`, flag muerto `LEGAL_LOCK`.
- **Dinero que la Fase A NO quitó (fuga legal real; el léxico no escanea `.tsx` ni veta "dinero")** — maqueta de dinero (toggle €, input, `moneyMock`) fuera de `PickPanel` (/p) y `PorraSlide` (feed); copy huérfana fuera de mensajes (`pick.*`, `teaser.money.*`, `moneyMock.*`); admin capa-2 fuera (`/admin/negocio` + `PartnerBrief`/`LicensePlan`, nav muerto `/admin/money`, 233 claves `adminMoney.*`); traductor de errores de dinero `lib/errors.ts` + dict `messages/money/` fuera.
- **Docs/guardrails** — `REGLAS-LEGALES.md`, `CLAUDE.md` (geo global + "nunca simular usuarios"), `AUDITORIA-VINKO.md`. Higiene: `tsconfig.tsbuildinfo` desindexado.
- Verde en cada commit: 64 migraciones aplican desde cero + reto/s2/latentes SQL · 153 unit · léxico · paridad i18n · build.

Aparte: sesión de **infra** lanzada (`claude/infra-multientorno`): multi-entorno + gate de CI + siembra de secretos. Brief en `scratchpad/TAREA-INFRA-MULTIENTORNO.md`.

## B. Backlog restante, ordenado

### P0 — antes de la beta cerrada (primera quincena de enero)

**Teardown (terminar lo legal/estructural):**
- Resto de **C**: racha = votar → **hecho** (`0063`) · captura de UTM → **hecho** · pique del día por mercado (no Madrid 9:00) → va con **mercados** · feed sin sesión deja votar **+** tapar fuga de reparto (`PorraSocial`/`RetoView` antes de votar) → **dependen del doc de diseño** (el patrón de invitado ya existe en `PickPanel`/`RetoView`; falta confirmar el UX exacto del reveal pre-voto).
- **D**: scrub de copy de dinero restante + **tuteo es-CO** (fuera "vosotros") · páginas `/legal/*` (términos/privacidad/cookies/normas con lo de `VINKO_PRODUCT_SPEC §3.2`) · consentimiento (Ley 1581 en el registro; banner solo UE; PostHog tras consentimiento; push opt-in; registro de consentimientos).
- **E**: invariantes de Vinkos forzados en BD + **test de CI que falle si se violan** (incl. "nunca simular usuarios") · recompensas **deterministas** (sin aleatoriedad) · tablas de cumplimiento append-only (edad, consentimientos, versión de términos, ledger de Vinkos, porras rechazadas) · cola de moderación cableada de verdad · CI: lexicon ES/EN/PT + test de términos prohibidos (`bizum|paypal|wallet|withdraw|retirada|kyc|affiliate|escrow|payout|cashout|odds|cuota`) · `LEGAL-STATUS.md`.
- **§12 higiene** → **hecho**.
- **Dinero residual (follow-up, no es fuga viva)**: plumbing muerto del flag `money` en la landing (`app/page.tsx` + variantes `landing.*`/`landing.nm.*` + `STAKES`/`TICKER`/`MODES` con €; `money=false` ya lo oculta — conviene colapsar las variantes "nm" a canónicas y quitar las claves de dinero de la landing). `SaferPlay`: "límites de depósito" en € → decisión de producto (sin dinero, ¿el límite va en Vinkos o se quita?).

**Mercados (spec mercados/agente §1 — manda):**
- ✅ **Cimientos (`0064`, hecho)**: tabla `markets` (todas las columnas de la spec) con RLS; seed `GLOBAL`+`CO` activos, `ES` inactivo; columna `market` nullable (FK) en `porras`/`profiles`/`daily_picks`/`league_groups`. Aditivo, nadie la lee aún.
- **Backfill (siguiente, migración `0065`)** — decisión tomada: a `GLOBAL` el contenido/usuario actual (es el público global-español, y GLOBAL está activo, así nada desaparece al encender los filtros). PERO por tabla: `profiles`, `daily_picks`, `league_groups` → `set market='GLOBAL' where market is null`; **`porras` SOLO las oficiales/editoriales** (verificar la columna: `source`/`official`/`is_template`) — **las de grupo quedan `market=null`** (invariante de la spec: grupo = sin mercado). (Mover porras editoriales Spain-específicas a `ES` inactivo es curación de contenido posterior.)
- **Resolución del mercado del que mira**: logueado → `profiles.market`; invitado/sin valor → `GLOBAL`. (Más adelante: ruta `/co` y geo asignan `CO`; el alta pone `profiles.market` según locale/geo.) Helper nuevo `lib/markets.ts` (lee `markets`, cachea, expone `tz/noun/locale/daily_pick_hour` por código).
- **`getFeed` filtra por `market`** (ver `lib/feed.ts`): porras oficiales/editoriales del mercado del que mira (las de grupo, `market=null`, siguen su canal). Con el backfill a GLOBAL el feed del usuario GLOBAL no cambia. **Descubrir con pestañas [Colombia] | [Global]**.
- **i18n enrutado**: quitar `LOCALE="es"` de `lib/i18n.ts`, locale `es-CO`, sustantivo por mercado (`noun.*`; "polla" CO **pendiente de confirmación** — por ahora `noun='porra'` en la tabla). OJO: `t()` lo usa TODO; cambio delicado.
- **Zona horaria por usuario/mercado**: **eliminar ~65 `Europe/Madrid`** (hoy hardcodeado en `fmtFecha`, `madrid_today`, crons…); corte de liga `league_week_start` → **lunes `league_cutoff`:00 hora del mercado**; pique del día a `daily_pick_hour` local (hoy `cron_open_daily` usa hora Madrid fija).
- **Quitar España**: catálogo/porras editoriales ES → `market='ES'` (inactivo); parámetros de noticias y prompt por mercado (va con el agente).
- **Orden sugerido**: backfill (`0065`) → `lib/markets.ts` + resolución → filtro de `getFeed` + Descubrir CO|Global → zona horaria → i18n enrutado. Cada paso: verde (`test:sql` desde cero + build + unit + léxico) y commit pequeño.

**Agente de contenido (spec §2 — manda):**
- Desbloqueo: `ANTHROPIC_API_KEY`, sembrar `internal.secrets.cron_secret` (== `CRON_SECRET`), desplegar `trend-generate`/`voice-porra`/`rewards-claim`, registrar respuesta del cron en `agent_runs` (fin del fallo silencioso), permitir política (§2.6).
- Pasar a Colombia: fuentes `gl=CO`/`cc=CO`, prompt y catálogo CO (§2.3), fechas en Bogotá.
- Calendario deportivo (proveedor con Liga BetPlay — **verificar**) → porras de partido con **resolución automática**; calendario editorial recurrente (reality).
- **Cupo** por mercado (§2.5), **nota 0–100** (§2.6: resuelve-pronto/divide/caliente/comprobable/mezcla; descarta >80 %), **niveles de autonomía** A/B + interruptor de emergencia (§2.7).

### P1 — lanzamiento (mediados/finales de enero)
- Carpeta `/co` + `/` global + **aviso de país** (patrón e-commerce, no redirige; nunca en `/p` antes de votar) + `hreflang`/`canonical`/sitemap por mercado.
- Google Trends CO (calor), panel de observabilidad del agente (`/admin`).
- Auth: Google OAuth a Producción + magic link con Resend (`token_hash`).

### P2 — tras el soft launch
- Conectores sociales (YouTube/X/TikTok) + worker; aprendizaje de pesos de la nota; ascenso de categorías a automático; mercados MX/BR/UK.
- **Track de producto/visual** (doc de diseño, propuesta + A/B): pantalla **"Lo dije"** + compartir-como-texto, Inicio "Tus grupos" en lista vs feed (A/B), nav con iconos **Lucide**, colores de bando cian/rosa, fuente display autoalojada, pase **anti-casino**, activar plantillas de crear, reto/pique de racha, recibo de vergüenza, Vinko Ads (autoservicio).

## C. Cómo ejecutar (recomendado)

El rebuild es de varias semanas; no cabe en una sola sesión. Por bloque, abre una sesión de Code sobre `claude/solo-puntos` (o una rama por bloque), pega la spec correspondiente y deja que ejecute con los guardrails del repo. Regla de oro de cada PR: pequeño, con inventario, y **verde** (`npm run predeploy` equivalente + `tests/sql/run.sh` desde cero). No abrir PR salvo que se pida; no desplegar el dinero.

## D. Decisiones externas abiertas (no son código)
- **Abogado Colombia**: solo-puntos, premios por ranking, anuncios/afiliación de operadores con licencia, Ley 1581, transferencia de datos; **y el geo global** (jugar en US/BR/UK sin premios — riesgo asumido, confirmar).
- **Proveedor de calendario deportivo** con Liga BetPlay (cobertura, precio, licencia de datos).
- **Sustantivo CO** ("polla") — confirmación de Ricardo + revisión nativa.
- **Poner el repositorio en privado** (hoy público — código, migraciones y admin a la vista).
- Google OAuth a Producción, cuenta Resend, cuentas Meta/Google Ads a nombre de la C-Corp.
