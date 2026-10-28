# Auditoría técnica de Vinko — inventario de lo roto, a medias y apagado

> **Fecha:** 24-oct-2026 · **Autor:** auditoría de ingeniería (lectura directa del código, no de los docs) · **Rama:** `claude/vinko-audit-defects-643e1x`
>
> **Objetivo del encargo:** inventario honesto y completo de todo lo que no funciona, está a medias o está apagado, con su **causa raíz**, para decidir qué se rescata y qué se reconstruye bajo una empresa nueva. **No se arregla nada aquí.**
>
> **Método:** se verificó abriendo los archivos reales y ejecutando build, tests unitarios, el léxico, la paridad i18n y **las migraciones completas sobre un Postgres 16 efímero**. No se confió en `CONTEXTO-VINKO.md`, `CLAUDE.md` (está gitignored, no está en el árbol) ni en `supabase/schema.sql` (marcado *LEGADO, no se aplica*).

## Leyenda de causa raíz (se usa en todo el documento)

- **(1) Falta pieza externa** — una clave de API, cuenta, conector o worker que no está.
- **(2) Bug real / mal diseño** — el código está mal o es frágil.
- **(3) Apagado a propósito** — flag en off o feature deliberadamente incompleta.
- **(4) Nunca se construyó** — no existe.

---

## 0. Qué NO pude verificar (honestidad primero)

- **El estado de producción en vivo.** Desde este entorno el DNS de `www.vinko.fun` está bloqueado (`getaddrinfo ENOTFOUND`). No pude observar qué versión sirve hoy la web, ni correr el smoke E2E contra producción. Todo lo que digo sobre "producción" se infiere del código, del CI/CD y del historial de commits, no de una observación directa.
- **Qué secretos están realmente puestos** en Vercel y Supabase (`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `VAPID_*`, `internal.secrets.cron_secret`, las claves del proveedor de dinero). No viven en el repo (correcto), así que no puedo confirmar su presencia ni su coherencia entre los dos almacenes.
- **Si alguien tocó a mano los flags de `remote_config`** en la base de producción (las migraciones los siembran apagados; un admin podría haberlos encendido).

Donde esto importa, lo marco explícitamente.

---

## 1. Resumen ejecutivo (veredicto brutal)

**Vinko no es un prototipo roto; es una base de código sorprendentemente sólida y bien testeada que está casi entera APAGADA a la espera de piezas externas y decisiones.** El 80 % de los "defectos" no son bugs: son features completas y correctas, con tests, que no pueden encenderse porque falta una clave, una cuenta, un worker o una aprobación legal. El 20 % restante sí son problemas reales, y hay dos que importan para una empresa nueva.

Señales de salud **verificadas ejecutando** (no leídas):

| Comprobación | Resultado |
|---|---|
| `npm run build` (Next 15) | ✅ exit 0, sin errores de tipos |
| `npm run test:unit` | ✅ **232 OK · 0 fallos · 23 ficheros** |
| `npm run lexicon` (léxico prohibido) | ✅ limpio (56 JSON + 30 migraciones) |
| `node scripts/i18n-parity.mjs` | ✅ 1930 claves es/en en paridad (pero el checker es débil, §15) |
| `bash tests/sql/run.sh` (**las 59 migraciones desde cero** + tests SQL) | ✅ **todas aplican · 3 suites SQL pasan** |
| Linter de JS/TS (ESLint) | ❌ **no existe** — "lint" es solo `tsc` + checks caseros |

**Las dos verdades grandes que el documento de contexto esconde:**

1. **El modelo del producto cambió de raíz.** `CONTEXTO-VINKO.md` describe "solo puntos virtuales, cero dinero, migraciones 0001–0011". La realidad son **59 migraciones (0001–0059)** y un subsistema de **dinero real** completo: cartera con euros, KYC, retiradas, pools de dinero, liquidación P2P, suscripción de pago ("Club" vía Stripe), afiliación a operadores con licencia y *revenue share*. La "regla de oro: nunca dinero de usuarios en la BD" se reinterpretó (ver §12): el núcleo guarda **referencias**, no saldos, y hay un invariante de esquema que lo vigila. Es un diseño deliberado y documentado, pero es una contradicción frontal con el contexto y **merece revisión legal explícita**.

2. **Todo pende de secretos y flags que se ponen "fuera de banda".** El pipeline de push, el agente de tendencias, la voz→porra y el dinero están correctamente programados pero **inertes** porque dependen de claves y de una fila `internal.secrets.cron_secret` que **ningún script del repo crea**. Si no están puestas (o no coinciden entre los dos almacenes), las cosas "corren" pero no hacen nada, **en silencio**.

**Recomendación de una línea:** se rescata casi todo (ver §17). Lo que hay que reconstruir no es código, es el **arranque reproducible** (migraciones desde cero, siembra de secretos, matriz de flags) y hay que tomar una **decisión legal** sobre el subsistema de dinero antes de encenderlo.

---

## 2. El gran cambio: de "porras con puntos" a plataforma con dinero real

El historial de migraciones cuenta la evolución que el contexto no cuenta:

- **0001–0027:** el loop social con moneda virtual ("Vinkos"/puntos). En 0026 el pick pasó de 10 fijos a **apuesta variable**; en 0027 el reparto se corrigió a **parimutuel** (reparto proporcional a lo puesto, con *floor* para no crear puntos de la nada, y devolución si nadie acierta). Esto es solo puntos virtuales.
- **0045–0051, 0054, 0056:** el subsistema de **dinero real** (referencias a proveedor, pools, cartera, KYC, P2P, Club, afiliación, juego seguro/autoexclusión).
- **0057–0059:** "El Reto" (porras con premio-cosa entre amigos, con juez y ventana de objeción), endurecimiento S2 y el parche de "fallos latentes".

La presencia de **autoexclusión y límites de depósito** (`0051_safer_play`) confirma que en algún momento esto se diseñó como producto de juego con dinero. Hoy ese subsistema está **apagado por defecto y a prueba de fallos** (§12).

---

## 3. Autenticación

**Estado: Google funciona; el enlace mágico sigue siendo frágil.**

- **Google OAuth** — vía `supabase.auth.signInWithOAuth` (`components/auth/LoginForm.tsx:38-47`). Es el camino fiable. El callback (`app/auth/callback/route.ts`) está muy bien hecho: maneja PKCE y `token_hash`, convierte invitados (`convert_guest`/`merge_guest`), reclama invitaciones, fuerza la pantalla +18, y bloquea cuentas borradas.
- **Enlace mágico (magic link): roto para uso entre dispositivos. Causa raíz (1)+(2).** El cliente usa `createBrowserClient` **sin fijar `flowType`** (`lib/supabase/client.ts:8`), así que `@supabase/ssr` usa **PKCE por defecto**. El correo lleva un `?code=` que exige el `code_verifier` guardado en **el mismo navegador** que lo pidió. Si abres el correo en el móvil (o en webmail) y lo pediste en el escritorio, el verifier no está → `exchangeCodeForSession` falla → vuelta a `/login?err=1`. **Este es exactamente el bug reportado "el magic link devuelve al login".** El callback ya soporta la rama robusta `token_hash`, pero no se usa: requiere editar la plantilla de email de Supabase para emitir `{{ .TokenHash }}`, y eso exige **SMTP propio (Resend) o plan de pago**. Mientras tanto, el enlace mágico solo es fiable si se abre en el mismo navegador. → **Falta pieza externa (SMTP/plantilla) + fragilidad inherente de PKCE.**
- **Perfil automático** al primer login (`handle_new_user`, `0002`): genera handle desde el email, evita colisiones. Correcto.

---

## 4. La "Puerta" (candado de inversores)

**Estado: candado suave, apagado por defecto. Causa raíz (3), no es un problema.**

`components/Gate.tsx` + `lib/gate.ts`: código diario de 6 dígitos que rota cada 24 h (hora de Madrid). **Solo se activa con `NEXT_PUBLIC_ALPHA_GATE=on`** (`Gate.tsx:32`) y se salta con cualquier sesión. Es validación **en el cliente** (djb2 con una sal `NEXT_PUBLIC_*` que igual acaba en el bundle), así que es un candado **cosmético**, no seguridad real — y así está documentado en el propio archivo. No bloquea nada hoy.

---

## 5. Base de datos, RLS e integridad del modelo

**Estado: activamente mantenida y bien testeada; dos vulnerabilidades reales del pasado ya corregidas; un modelo de permisos sutil y propenso a regresiones.**

- **Las 59 migraciones aplican limpias desde cero** (verificado con `tests/sql/run.sh` sobre Postgres 16). El modelo de datos es reconstruible. Las migraciones ≥0055 son idempotentes por diseño.
- **Bug real ya corregido — recursión infinita de RLS (0019).** Las policies que miraban `group_members` se referenciaban entre sí (error `42P17`) y **dejaban el feed vacío**. Se arregló con helpers `security definer` (`is_group_member`, `shares_group`). Nació de "dos caídas del feed en una semana" (de ahí el smoke E2E). **Corregido.**
- **Vulnerabilidad real ya corregida — `profiles` era un libro abierto (hasta 0055).** Desde `0003` la policy era `using(true)` **sin revocar el `select` por columnas**: cualquiera con la anon key leía **todas las columnas de todos los perfiles** — año de nacimiento, `pay_handle` (Bizum/PayPal), país, `safer_play`, `referred_by`, intereses. `0055_sec01_profiles_private` lo cierra con grants por columna. **Esto estuvo expuesto en producción un tiempo largo.** → bug (2), **ya remediado**, pero conviene asumir que esos datos pudieron scrapearse mientras estuvo abierto.
- **Deuda de diseño (2), menor:** el candado real de `profiles` es "policy `using(true)` + privilegios por columna". Es fail-closed para columnas nuevas (no se leen si no se añaden al grant), pero es **sutil**: `0059` ya tuvo que parchear `profile_public` porque al ocultar `is_anonymous`/`deleted_at` las páginas `/u/[handle]` y la imagen OG empezaron a filtrar perfiles de invitados y de cuentas borradas. Mantenerlo exige disciplina.
- **GDPR real (0037 + edge `account-purge`):** `delete_me()` anonimiza y `account-purge` borra la cuenta de auth de verdad. Desplegado por el CI. Correcto.

---

## 6. Loop de porras, picks y resolución (+ "El Reto")

**Estado: el núcleo actual vive en 0057/0058, es coherente y está testeado (reto.test.sql, s2.test.sql pasan).**

OJO: `resolve_porra`, `make_pick`, `porra_settle` se redefinen a lo largo de **8 migraciones**. Lo vigente es:

- **`make_pick` (0057):** apuesta variable con mín/máx de `remote_config`; en un **reto con premio** el pick cuesta 0; da XP (con tope diario) y racha, nunca escala con el importe. Avisa al creador en cada entrada.
- **`porra_settle` (0058, el motor de reparto):** parimutuel proporcional, con devolución si nadie acierta. **La Puntería solo se concede cuando es habilidad** (editorial, o porra de usuario de Vinkos con **≥5 participantes reales y juez que no juega**) — regla RT-08. Los retos-premio no mueven Vinkos.
- **`resolve_porra` (0057):** valida creador/árbitro/admin y estado, delega en `porra_settle`.
- **Flujo de resultado del Reto (0057):** el juez propone, hay **48 h para objetar** (1 objeción en 1v1; 30 % en grupo), confirmación anticipada, y un cron (`cron_result_flow`, cada 10 min) que liquida vencidas, recuerda a las 24 h y **cancela con devolución a las 72 h**.
- **Invitados:** `make_guest_pick` + `merge_guest`/`convert_guest` pasan los picks de invitado a la cuenta real sin duplicar.

Esto es trabajo serio y correcto. No encuentro bugs de reparto; el test unitario incluso verifica que la **última** definición de `resolve_porra` sigue siendo parimutuel con floor + devolución.

---

## 7. Las tres monedas y la fórmula de puntuación

**Estado: correcto y protegido por tests. Causa raíz: ninguna (funciona).**

- **Monedas** (`points`), **Nivel** (`xp`), **Puntería** (`marcador_total`, interno). Definidas en `0007`.
- **Fórmula de Puntería** (en `porra_settle`): `round((score_base + score_range · (1 − p)) · streak_mult(user))`, donde `p` = fracción de acertantes (cuantos menos aciertan, más difícil, más puntería). Se duplica con el boost "Doble o nada". **No depende del importe apostado** (mérito, no volumen).
- **Invariante legal verificado por test** (`tests/unit/skill-guard.test.mjs`, pasa): **solo** `resolve_*` y `award_score` escriben `marcador_total`; `grant_ad_reward*`, `buy_item`, `claim_drip`, `claim_daily_bonus`, `change_pick`, `claim_referral`, etc. **no la tocan**. Es decir, los anuncios y la tienda **nunca compran Puntería**. Esto está bien blindado.

---

## 8. Ligas, temporadas y grupos

**Estado: construido y cableado por cron. Causa raíz: ninguna sustancial.**

- **Ligas** (`league_groups`/`league_members`, corte semanal UTC), **temporada "El Camino"** (`seasons`/`season_progress`/`user_cosmetics`), **rachas** (cuenta participación, con escudos y recuperación), **grifos de monedas** (goteo + bonus diario) — todo en `0007`.
- **Grupos** (`0035`): clasificación por Puntería, juez de grupo, racha de grupo, resumen semanal (PNG).
- Cron-wired: `cron_tick` (cada 15 min) dispara apertura del pique, recordatorios, racha en riesgo, cierre semanal de liga y reactivación; `vinko-season-rotate` (0058) rota temporada. **Pero** ver §10 sobre la fragilidad de los crons.

---

## 9. Agente de tendencias / apuestas candentes

**Estado: el pipeline es REAL y está cableado de punta a punta, pero hoy es un pipeline que no produce nada.**

- **Lo que SÍ existe y funciona:** `signals → IA (Haiku) → cola de aprobación (topic_proposals) → aprobación humana → porra`. La UI de admin real es `TemasLive.tsx` (aprobar/editar/descartar, con RPCs reales `publish_proposal`/`reject_proposal`/`update_proposal`). El **veto de cuotas/odds** es defensa en profundidad y sólido: regex en ingesta, en la salida del modelo, y **dos triggers de BD** (`trg_signals_odds`, `trg_topics_odds`). La línea roja legal se respeta.
- **La ingesta real son solo RSS de noticias.** El único origen construido es **Google News RSS + Bing News RSS** por palabras clave sobre un catálogo curado (`tracked_entities`, 0024). `signals` se escribe en **un solo sitio de todo el repo**: `trend-generate/index.ts`. Nadie más la toca.
- **Los conectores sociales NUNCA se construyeron. Causa raíz (4)+(1).** No hay **nada** de código que lea Google Trends, YouTube Data API, X, TikTok, Apify ni calendarios deportivos. El `remote_config.trend_agent.sources` (con flags `youtube`, `google_trends`, etc.) es **config vestigial que la función v3 ni lee**. El worker (Railway) tampoco existe.
- **La generación IA está bloqueada. Causa raíz (1).** Depende de `ANTHROPIC_API_KEY` (modelo `claude-haiku-4-5`), que está "pendiente" (sin poner). **Y sin clave NO hay fallback de plantilla** (`index.ts:363`: "Sin modelo no se inventan porras"): cada señal se marca `rejected`/`sin_modelo`. Resultado neto hoy: 0 propuestas. (El contexto que dice "si no, plantilla" está **desactualizado**.)
- **Auto-publicación apagada a propósito (3):** `vinko-agent-publish` se des-programó en 0030 ("el agente NO publica solo"). El barrido `vinko-agent-sweep` (cada 3 h) **sigue activo en el código**, pero llama a una función que el CI no despliega (ver §10).
- **Código muerto (4):** `components/admin/TemasBoard.tsx` es una demo cliente que no está importada en ningún sitio.

---

## 10. Crons y Edge Functions

**Estado: bien diseñado pero con dos trampas de "fallo en silencio" y un desajuste de despliegue.**

**Jobs pg_cron (todos cableados en migraciones):** `vinko-tick` (15 min), `vinko-push-dispatch` (5 min), `vinko-agent-sweep` (3 h), `vinko-reto-results` (10 min), `vinko-club-expire`, `vinko-season-rotate`, `vinko-editorial-expire`, `vinko-admin-daily`, `vinko-daily-fallback(-cet)`, `vinko-buffer-alert`, `vinko-kpi-rollup`, `vinko-flag-suspects`.

- **Trampa de silencio nº1 — el secreto del cron no lo siembra nada (1)+(2).** Los jobs que llaman a Edge Functions (`push-dispatch`, `trend-generate`) mandan la cabecera `x-cron-secret` leída de `internal.secrets`. **Ninguna migración ni script del repo inserta esa fila** (verificado: 0 coincidencias). Si no está puesta a mano por API, la cabecera va `null`, la función responde **403**, y como `pg_net` es *fire-and-forget* **nadie registra el fallo**: los push quedan encolados para siempre y el agente no genera. Además ese valor debe **coincidir** con el env `CRON_SECRET` del lado Edge (dos almacenes distintos, los dos fuera de banda).
- **Trampa de silencio nº2 — `cron_tick` se traga todos los errores (2).** Cada sub-tarea va envuelta en `begin ... exception when others then null; end` (`0018`). Es resiliente, pero cualquier fallo de apertura de pique, cierre de liga o reactivación **desaparece sin rastro**. No hay observabilidad.
- **Desajuste de despliegue (2):** el repo tiene **8 Edge Functions** pero el workflow `supabase-deploy.yml` **solo despliega 3**: `push-dispatch`, `account-purge`, `billing-webhook`. **NO despliega** `rewards-claim` (crédito de anuncios recompensados), `trend-generate` (agente), `money-webhook` (cartera/pools) ni `voice-porra`. O se despliegan a mano (`scripts/deploy-edge.mjs`) o están ausentes/obsoletas en prod. En particular el cron `vinko-agent-sweep` llama a una función que el CI nunca despliega.
- **Push — segunda trampa (1)+(2):** el dispatcher (`push-dispatch`, usa la lib `web-push`) exige `CRON_SECRET` + `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` como env. Si faltan las VAPID, `setVapidDetails(undefined, undefined)` **lanza** y el lote entero 500ea; la cola se amontona sin aviso. Y la **clave pública VAPID tiene un fallback hardcodeado** en el cliente (`lib/push.ts:8`): si la privada desplegada no es su par matemático, **todos los push se rechazan en silencio**.

Lo demás del push está muy bien: tope por usuario en BD con *advisory lock* y horas de silencio (`try_reserve_push`), `notify_user` solo encola si hay cupo, Service Worker compatible con iOS.

---

## 11. Anuncios (display y recompensado)

**Estado: todo el cableado de Google es real, pero inerte con la config actual; el recompensado que de verdad corre es un stub.**

- **Flags:** `ADS_ENABLED` por defecto **false** (display apagado); `LEGAL_LOCK` por defecto true **pero es un flag MUERTO (2)** — se exporta y documenta pero **no lo lee ningún código**. La "protección legal" que promete no la aplica nadie.
- **Display AdSense:** etiquetas `<ins class="adsbygoogle">` reales con `ca-pub-7388549278894123` y slot `5485973348` hardcodeados de fallback; apagado por `ADS_ENABLED`. Correctamente **excluido de `/p/[slug]`** y del flujo de pronóstico (`AdsLoader.tsx`). → (3) + (1) necesita aprobación de Google.
- **Recompensado:** la cascada real (H5 Ad Placement → vídeo de patrocinador → GAM) **falla las tres** con la config actual (sin unidad de GAM, sin cuenta H5 habilitada, patrocinador apagado). Cae al **camino "house": una cuenta atrás de 3 segundos y luego acredita** (`RewardedSlot.tsx:110-119`). **No hay red publicitaria ni prueba de que se viera un anuncio.** El `impression_id` lo genera el cliente, así que la idempotencia evita el doble-cobro de **un** crédito, no el "no vi nada". → stub (3)/(4).
- **Crédito servidor (sólido):** `rewards-claim` + `grant_ad_reward_v2` es service-role, +18, idempotente por `impression_id`, con topes día/semana/mes, y **nunca toca la Puntería** (verificado).
- **Incompleto (4):** de los slots R1–R6, **solo R1/R2/R3 están montados en la UI** (`SaldoClient.tsx`); R4/R5/R6 existen en config y RPC pero no se renderizan.
- **Matiz legal (3):** hay un **slot de afiliación a operadores de juego embebido en `/p/[slug]`** (`AffiliateSlot`), que hoy no pinta nada (afiliación apagada) pero estructuralmente es monetización en la landing de pronóstico. Revisar contra la regla "cero anuncios en `/p`".

---

## 12. Subsistema de DINERO (cartera, KYC, retiradas, Club, P2P, afiliación, revshare)

**Estado: diseño cuidadoso con custodia delegada; casi todo apagado a prueba de fallos; lo único real y desplegado es el Club (Stripe). Causa raíz dominante (3)+(1), con un (4).**

Esta es la mayor divergencia con el contexto y la que más impacta la decisión de rescatar/reconstruir.

- **Principio de diseño:** el núcleo de la BD guarda **referencias** (IDs externos, estados, config de pools), **nunca saldos, tarjetas ni IBAN**. Hay un **invariante de esquema** (`money_schema_invariant()`, 0045) que falla si una tabla ligada a usuario tiene columnas tipo `balance|wallet|iban|card_|amount|currency`, salvo exenciones explícitas.
- **Casi todo APAGADO y fail-closed (3):** `money_ui.enabled=false` (0056) oculta toda la UI de dinero; `club.enabled=false` (forzado en 0056); `p2p.enabled=false` (0054); todos los países `points_only`/`provider:null` (0045); afiliación off. La UI entera hace `notFound()` si el flag está off (`/verificar`, `/juego-seguro`, `/showcase`, `/cartera`, bloques en `/p`, `/feed`, `/`).
- **El proveedor de dinero real NUNCA se terminó (4)+(1):** existe `HttpMoneyProvider` (cliente REST firmado, HMAC propio) pero **sin endpoint** — solo un ejemplo en comentario — y su cabecera admite que el mapeo al proveedor concreto (PaymentIQ/Nuvei/partner) es TODO. En producción `getMoneyProvider()` devuelve `null`, así que `/api/money/{join,kyc,withdraw}` y el admin de pools responden **503 `provider_unavailable`**. No están stubbeados: están inalcanzables sin proveedor.
- **La cartera guarda euros como espejo, no como saldo:** `money_ledger_refs.amount_minor` (0050) es un **espejo de apuntes confirmados por el proveedor**; `wallet_get()` calcula un saldo **estimado, no autoritativo**.
- **Lo ÚNICO real y desplegado: Vinko Club = Stripe.** `/api/club/checkout` y `/api/club/portal` llaman a `api.stripe.com` de verdad; `billing-webhook` verifica **firmas reales de Stripe** y llama `club_apply_event`. Funciona en cuanto se pongan `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` y `club.enabled=true`. Vende solo perks de software, no toca puntos. `0059` endurece el webhook contra **eventos de Stripe fuera de orden** (checkout vs subscription, cancelación definitiva, derecho desde todas las suscripciones, cuenta purgada sin bucle de reintentos) — con un límite conocido y documentado (dos `updated` con estados reales invertidos entre sí no se distinguen sin guardar `event.created`). Esto demuestra que el camino Stripe se usa y se depura de verdad.
- **P2P = libro "quién debe a quién" (0048), SIN pasarela.** Reparte deudas (algoritmo greedy) y da enlaces `PayPal.me`/Bizum fuera de banda. Vinko nunca está en medio del pago. Real, apagado.
- **`money-webhook` (cartera/pools) NO está desplegado** (ni en `config.toml` ni en el CI) → aunque se encendiera, no puede recibir eventos del proveedor.
- **Matiz legal honesto:** aunque no hay saldos, sí hay euros por usuario (`amount_minor`) en 3 tablas de referencia/espejo/liquidación (`money_ledger_refs`, `p2p_settlements`, `revenue_share_statements`), todas exentas en el invariante y documentadas como "no es saldo del núcleo". **Si esto cumple la regla legal original es una decisión de abogado, no de ingeniería** — pero es deliberado y documentado, no accidental.

---

## 13. Voz → porra

**Estado: construido, inerte. Causa raíz (1).** `/api/voice-porra` + edge `voice-porra` convierten un dictado en una porra estructurada con Haiku. Exige `CRON_SECRET` **y** `ANTHROPIC_API_KEY` (sin clave → 400 `no_key`). Como el agente, cae con la clave de Anthropic pendiente. Además el edge `voice-porra` tampoco está en el CI de despliegue.

---

## 14. Deploy y CI/CD

**Estado: funcional pero con un camino de arranque frágil y protecciones clave fuera del CI.**

- **Hosting: Vercel** (región `dub1`). El CI escucha eventos `deployment_status` de Production, lo que indica que **la integración Vercel↔GitHub ya existe** (contradice el contexto §7.1, que decía que no había auto-deploy). `netlify.toml` sigue en el repo: **leftover obsoleto** (2, menor).
- **Despliegue de Supabase (`supabase-deploy.yml`): solo aplica migraciones ≥0055**, asumiendo que 0001–0054 "ya están en producción". **No hay camino de rebuild limpio vía CI:** para una base nueva (empresa nueva) hay que aplicar las 59 a mano. Las SQL del repo sí aplican desde cero (verificado), pero el workflow no lo hace.
- **El CI (`ci.yml`) NO corre el gate completo (2).** Corre léxico + i18n-parity + unit + `tsc` + build + smoke E2E. **Omite** `scripts/schema-invariant.mjs` (el invariante legal "sin columnas de dinero") **y** `tests/sql/run.sh` (tests de migraciones). El gate completo existe en `scripts/predeploy.mjs`, pero **el CI no lo invoca**: las protecciones más fuertes son opt-in/manuales.
- **No hay ESLint** (ni dep, ni config, ni script). El "linter" es `tsc` + los checks caseros (léxico, paridad, invariante).
- **El build del CI corre con las env de Supabase vacías**, así que no detecta problemas de configuración de runtime.
- **Higiene del repo (2, menor):** están **commiteados** `vinko-static.zip` (~9 MB), `tsconfig.tsbuildinfo` (artefacto de build, ni siquiera en `.gitignore`) y toda la carpeta `legacy-web-v1/` (sitio viejo con su `dist/` y vídeos `.webm`). `vinko-static.zip` sí está en `.gitignore` pero se commiteó antes, así que sigue pesando en el historial. Peso muerto para una empresa nueva.

---

## 15. Internacionalización (ES/EN)

**Estado: efectivamente solo-español por diseño de alfa, aunque el catálogo EN está completo y traducido. Causa raíz (3) con smells (2).**

- **El EN existe y es real:** 1930 claves, **~96 % de los valores difieren del ES** (traducción de verdad, no copias). Paridad de claves mantenida en los 27 ficheros `parts/*` (es/en con conteos iguales, sin stubs) y en `messages/money/*` (59 claves).
- **Pero NINGÚN usuario puede ver la UI en inglés (3).** `lib/i18n.ts:9` fija `const LOCALE = "es"` y la función `t()` resuelve **tanto el idioma como el fallback contra `dicts.es`** — `en.json` **no se lee jamás**. Hay un selector de idioma en Ajustes y Onboarding que persiste `profiles.lang`, pero es **inerte** (solo localiza nombres de país vía `Intl.DisplayNames`), y así **se le avisa al usuario** ("la app va en español por ahora"). Dos componentes (`SponsorBadge`, `MoneyI18n`) importan `enParts` pero **nunca lo leen** (imports muertos en el bundle).
- **El checker de paridad es débil (2):** solo comprueba igualdad de **conjuntos de claves** y presencia de claves `t("literal")`; **no compara valores EN**, no cubre los wrappers (`tr`, `tSponsors`, `tMoney`, `tm`), no mira `messages/money/`, y **no tiene detector de strings hardcodeados** pese a que su cabecera dice "cero strings hardcoded". Además `i18n-merge.mjs` **rellena claves de un locale al otro**, así que la paridad casi no puede fallar por ausencia.
- **Strings hardcodeados reales (2, menores):** en el flujo principal son pocos — `SaldoClient.tsx:14` (nombres de división "Bronce/Plata/Oro"), `NuevaClient.tsx:100` (`["Sí","No"]`), `LoginForm` muestra el `error.message` crudo de Supabase (en inglés). Más amplio: ~37 literales en español en 5 ficheros de **admin/demo/showcase** que el checker no detecta.

---

## 16. Tabla maestra de hallazgos por causa raíz

### (1) Falta pieza externa (clave / cuenta / worker)
- `ANTHROPIC_API_KEY` sin poner → agente de tendencias **no genera** (y sin fallback) y voz→porra da `no_key`. **Bloquea 2 features.**
- `internal.secrets.cron_secret` no lo siembra nada en el repo → push y agente fallan en 403 **en silencio**. Debe coincidir con el env `CRON_SECRET`.
- `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` fuera de banda → si faltan o no son par, push 500/rechazo **silencioso**.
- `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` → el Club no cobra sin ellas.
- Proveedor de dinero (PaymentIQ/Nuvei/partner): sin cuenta ni endpoint ni mapeo.
- SMTP propio (Resend) + plantilla `token_hash` → enlace mágico robusto.
- Aprobación de Google AdSense/Ad Manager; cuenta H5; unidad GAM → anuncios reales.

### (2) Bug real / mal diseño
- **Enlace mágico PKCE** se rompe entre dispositivos (cliente sin `token_hash`).
- **`cron_tick` se traga todos los errores** → crons fallan en silencio, sin observabilidad.
- **`LEGAL_LOCK` es un flag muerto** (no lo lee nadie).
- **CI no corre el invariante de esquema ni los tests SQL** (las protecciones fuertes no gatean merges).
- **Despliegue parcial de Edge Functions** (3 de 8) → el cron del agente llama a una función que el CI no despliega; `money-webhook` nunca desplegado.
- **`profiles` fue libro abierto** hasta 0055 (ya corregido; asumir exposición pasada).
- **Modelo de permisos por columna** sutil y propenso a regresiones (0059 tuvo que parchear `profile_public`).
- Clave pública VAPID hardcodeada que puede no casar con la privada desplegada.
- Higiene: `vinko-static.zip` (9 MB), `tsconfig.tsbuildinfo`, `legacy-web-v1/` commiteados; `netlify.toml` obsoleto.
- i18n: checker de paridad débil; selector de idioma inerte; imports `enParts` muertos; literales hardcodeados en admin/demo.
- Sin ESLint.

### (3) Apagado a propósito / incompleto
- **Todo el subsistema de dinero** (money_ui, Club, P2P, afiliación, por-país) — fail-closed.
- **Auto-publicación del agente** des-programada (0030).
- **La Puerta** de inversores (off salvo env).
- **Display de anuncios** (`ADS_ENABLED=false`) y patrocinador.
- **i18n EN** cableado pero no enrutado (`LOCALE="es"`).
- **money copy** bloqueada en prod (`legal_approved:false`).

### (4) Nunca se construyó
- **Conectores sociales del agente** (Google Trends, YouTube API, X, TikTok, Apify, calendarios deportivos) y su worker (Railway).
- **Adaptador de proveedor de dinero concreto** (solo el genérico `HttpMoneyProvider` sin endpoint).
- **Fallback de plantilla del agente** sin IA (se eliminó a propósito → 0 salida sin clave).
- **Slots de anuncio R4/R5/R6** en la UI.
- `TemasBoard.tsx` (demo muerta).

---

## 17. Recomendación: qué rescatar y qué reconstruir

### Rescatar casi todo el código. En concreto, es de calidad y reutilizable:
- **El núcleo del loop** (porras, picks, parimutuel, Reto, juez/objeciones) — bien diseñado y testeado.
- **Las tres monedas y la fórmula de Puntería** con su invariante anti-abuso testeado.
- **Gamificación** (ligas, temporada, grupos, rachas).
- **Push** (arquitectura y topes en BD) — solo le faltan secretos coherentes.
- **GDPR** (delete_me + purga).
- **El esqueleto del agente** (cola + aprobación + veto de cuotas) — el pipeline es real.
- **El catálogo i18n EN** (traducción completa) — solo falta enrutar el locale.

### Reconstruir / construir de cero (no es código viejo, es lo que falta):
1. **Arranque reproducible de la BD.** Un camino de migración desde cero en CI (aplicar 0001–0059, no solo ≥0055) + **siembra automática de `internal.secrets.cron_secret`** y verificación de que casa con `CRON_SECRET`. Hoy el arranque depende de pasos manuales no documentados en código.
2. **Conectores del agente de tendencias.** Es lo único realmente "nunca construido" que el producto promete. Decidir el recorte MVP (calendarios + 1 fuente) y escribir el worker que inserta en `signals`.
3. **Adaptador de proveedor de dinero** (si se va a lanzar con dinero) — y **antes, la decisión legal** sobre el modelo euros-como-referencia. Nada de esto es "arreglar un bug": es trabajo nuevo y una decisión de negocio/abogado.

### Antes de encender NADA en la empresa nueva (checklist crítico):
- [ ] **Decisión legal** sobre el subsistema de dinero y el slot de afiliación en `/p`.
- [ ] Meter `schema-invariant` **y** `test:sql` en el CI (hoy no gatean).
- [ ] Sembrar y verificar los secretos: `internal.secrets.cron_secret` == `CRON_SECRET`; par VAPID correcto; `ANTHROPIC_API_KEY`; Stripe; (proveedor de dinero).
- [ ] Desplegar **todas** las Edge Functions necesarias (no solo 3) o documentar cuáles son de verdad opcionales.
- [ ] Añadir **observabilidad a los crons** (que un fallo no se trague en silencio) y chequear el resultado de `pg_net`.
- [ ] Arreglar el enlace mágico con SMTP propio + plantilla `token_hash`, o aceptar "solo Google".
- [ ] Limpiar el repo (`legacy-web-v1/`, `vinko-static.zip`, `tsconfig.tsbuildinfo`, `netlify.toml`), añadir ESLint, quitar el flag muerto `LEGAL_LOCK`.
- [ ] Decidir si EN se enruta (quitar el `LOCALE` hardcodeado) o se asume ES-only y se quita el selector inerte.

---

## 18. Apéndice: secretos y flags esperados

| Secreto / flag | Dónde | Estado esperado | Efecto si falta |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Edge (Supabase) + Vercel (kpi-chat) | pendiente | agente 0 propuestas; voz→porra 400; sin fallback |
| `internal.secrets.cron_secret` (BD) | Supabase, por API | **no lo crea el repo** | push + agente 403 en silencio |
| `CRON_SECRET` (env) | Edge | fuera de banda; debe == fila BD | idem |
| `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` | Edge | par correcto | push 500 / rechazo silencioso |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel | debe ser el par de la privada | usa fallback hardcodeado (riesgo de mismatch) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Vercel / Edge | pendiente | Club no cobra |
| `MONEY_PROVIDER_BASE_URL_*` / `_APIKEY_*` / `_SECRET_*` | Vercel | ninguno | dinero 503 `provider_unavailable` |
| `remote_config.money_ui.enabled` | BD | `false` | UI de dinero oculta (fail-closed) |
| `remote_config.club.enabled` / `p2p.enabled` | BD | `false` | Club / P2P off |
| `NEXT_PUBLIC_ADS_ENABLED` | Vercel | `false` | display apagado (rewarded stub sigue) |
| `NEXT_PUBLIC_ALPHA_GATE` | Vercel | no `on` | Puerta desactivada |

*Fin de la auditoría. Las afirmaciones sobre producción en vivo no pudieron verificarse desde este entorno (DNS bloqueado); todo lo demás se comprobó leyendo el código y ejecutando build, tests y migraciones.*
