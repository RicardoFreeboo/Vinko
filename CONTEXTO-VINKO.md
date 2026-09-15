# Vinko — Contexto del proyecto (para retomar en otro chat)

> Documento de traspaso. Resume qué es Vinko, cómo está montado y qué queda, a fecha **15-sep-2026**. No contiene secretos: los tokens/keys los tiene Ricardo (ver §9).

---

## 1. Qué es Vinko

**Red social de porras (pronósticos) con puntos virtuales.** Web-first (móvil, marco 430px). Dominio **www.vinko.fun**. Fase pre-seed, alfa privada para ~50 amigos + demo a inversores.

**Loop:** crear porra → página `/p/[slug]` (SSR, compartible por WhatsApp) → entrar (Google/email) → pick gastando puntos → el creador resuelve → ranking. Encima: gamificación (pique del día, rachas, ligas, temporada, grupos), publicidad recompensada por puntos y notificaciones.

### Reglas de oro (LEGALES — nunca violar)
- **Nunca dinero de usuarios** en la BD (sin saldo/wallet/bote). Cero columnas de dinero.
- **Los puntos ni se compran ni se transfieren entre usuarios** (Ley 13/2011). No hay RPC de regalo/trueque; el único flujo inter-usuario es el bote de una porra.
- **Premios por ranking de destreza, jamás sorteo.**
- **Léxico prohibido** en toda la copy pública: apuesta, apostar, bet, cuota, odds, casa de apuestas, bote, jackpot, ganar dinero, casino… Solo: porra, pronóstico, predicción, puntos. Hay test de CI que lo verifica.
- **+18 declarado** (año de nacimiento; no es verificación de identidad). Edad mínima 14.
- **Cero anuncios** en `/p/[slug]` (la landing compartida) ni en el flujo de pronóstico.
- **El agente de tendencias NUNCA recoge cuotas/odds** (eso convertiría a Vinko en operador de juego). Veto en la capa de ingesta.

### Tres monedas separadas (nombres públicos)
| Interno | Público ES/EN | Qué hace |
|---|---|---|
| `points` | **Monedas / Coins** | Se gastan para jugar/recargar/comprar potenciadores. Los anuncios las dan. |
| `xp` | **Nivel / Level** | Progresión permanente. Los anuncios NO la tocan. |
| `marcador_total` (skill) | **Puntería / Accuracy** | Solo sube acertando (fórmula dificultad-ponderada). Decide liga. Los anuncios NUNCA la tocan. |

---

## 2. Stack e infraestructura

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind v4, SSR. `messages/es.json` + `messages/en.json` (cero strings hardcodeados; UI del alfa en ES).
- **Backend:** Supabase (Postgres + RLS + RPCs security-definer + Edge Functions Deno + pg_cron + pg_net). Proyecto ref **`uarnpxjdccbidgzhhavc`** (región EU).
- **Hosting:** **Vercel** (SSR). Proyecto "vinko" (`.vercel/project.json`). Dominio apuntado vía **Hostinger DNS API**. OJO: CLAUDE.md y el spec aún dicen "Netlify" — está **desactualizado**, es Vercel.
- **Auth:** Supabase Auth. **Google OAuth** (proyecto Google Cloud `vinko-508710`, ver `memory/google-oauth-setup.md`) + **magic link email**.
- **Analítica:** PostHog EU (opcional; `lib/analytics.ts`, todo evento lleva `is_seed`).
- **IA vídeo:** Higgsfield (Kling 3.0 Turbo) — 8 vídeos editoriales ya generados en `/public/v/`.

---

## 3. Base de datos (aplicada en Supabase, migraciones 0001–0011)

- `profiles` — id, handle, avatar_url, birth_year, **points** (def 1000), **xp**, **marcador_total**, division, racha (streak_days/best/last/shields/recover), daily_bonus, last_drip, role (user|admin), referred_by, frame/title.
- `porras` / `porra_options` / `picks` (pick fijo 10 pts, PK porra+user, boost 'double'). Vista `porra_tallies` (consenso, bypassa RLS a propósito).
- `daily_picks` + `daily_pick_answers` — el pique del día + buffer de 14 días.
- `pick_scores` — marcador por acierto (semana de liga).
- `league_groups` / `league_members` — ligas por división, corte semanal UTC.
- `seasons` / `season_progress` / `user_cosmetics` — temporada "El Camino".
- `groups` / `group_members` / `group_reactions` — grupos + reacciones.
- `store_items` / `user_items` / `purchases` — tienda de potenciadores (sumideros).
- `ad_impressions` (slot R1–R6, idempotente) / `user_unlocks` — publicidad.
- `notifications` (buzón) / `push_subscriptions` / `push_prefs` / `push_sent` (ledger de tope) / `push_queue`.
- `remote_config` — economía/ads/push/misc/trend_agent (todo ajustable sin deploy).
- `signals` — ingesta del agente de tendencias, con **trigger de veto de cuotas**.
- `topic_proposals` — cola de aprobación (porra|daily, criterio_de_resolucion obligatorio, flags).
- `internal.secrets` — secreto del cron para pg_net.

### RPCs clave (todas security-definer; el cliente nunca escribe monedas)
`make_pick`, `resolve_porra` (reparte bote + marcador §3.2), `answer_daily`, `resolve_daily`, `claim_drip`, `claim_daily_bonus`, `touch_streak`, `award_xp`, `award_score`, `buy_item`, `change_pick`, `create_group`, `join_group`, `claim_referral`, `grant_ad_reward_v2` (crédito por slot, jamás marcador), `notify_user` + `try_reserve_push` (tope de push EN BASE DE DATOS), `publish_proposal` (admin), `cron_tick`.

### Crons (pg_cron)
- `vinko-tick` cada 15 min: abre el pique del día, recordatorios de cierre, racha en riesgo, avisos de liga, cierre semanal de liga, reactivación.
- `vinko-push-dispatch` cada 5 min: vacía `push_queue` vía la Edge Function.

---

## 4. Edge Functions (Deno, desplegadas)
- `rewards-claim` — crédito de anuncio recompensado por slot (R1 rescatar racha, R2 +monedas, R3 escudo, R4/R6 +Nivel/boost, R5 análisis). Idempotente, +18, topes.
- `push-dispatch` — web push VAPID; vacía la cola. Requiere secreto `x-cron-secret`.
- `trend-generate` — señal → porra candidata (Haiku si hay `ANTHROPIC_API_KEY`, si no plantilla). Filtro léxico + veto cuotas + criterio obligatorio. Nada se publica sin humano.

Secretos de las funciones (en Supabase, no en el repo): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, y pendiente `ANTHROPIC_API_KEY`.

---

## 5. Rutas de la app
- `/` → redirige a `/hoy`.
- `/hoy` — pique del día + racha + regalo diario + resultado de ayer. (ancla del hábito)
- `/saldo` — Monedas/Nivel/Puntería + recarga (goteo) + anuncios recompensados R1/R2/R3/R6.
- `/grupos`, `/g/[id]` — grupos, clasificación por Puntería, compartir resumen por WhatsApp.
- `/liga` — clasificación de la división, zonas de ascenso/descenso.
- `/temporada` — El Camino (etapas por XP).
- `/buzon` — Novedades (buzón interno con badge).
- `/nueva` — crear porra en <30s y compartir.
- `/p/[slug]` — landing SSR pública + OG; pick real (client) + "El termómetro" (consenso). Sin anuncios.
- `/login`, `/bienvenida` (+18), `/u/[handle]`, `/secret` (código diario), `/admin/*`.
- Nav inferior en las pantallas logueadas. Todo envuelto por el **Gate** (código diario que cambia cada 24 h — el candado para enseñar a inversores; solo `/secret` lo bypassa).

---

## 6. Cosas que hay que saber para tocar el código
- **i18n:** todo texto visible va en `messages/{es,en}.json` con clave canónica. Nombres públicos: Monedas, Nivel, Puntería, "El pique del día", Grupo, Clasificación, El termómetro, Racha, Escudo, Liga, Temporada, El Camino, Etapa, Doble o nada, Cambiazo, Poner el foco, Regalo diario, Recarga, Novedades. Identificadores internos (columnas, eventos, config) NO se traducen.
- **CI:** `npm run lexicon` (test de léxico prohibido sobre la copy) + `npm run build`. Workflow en `.github/workflows/ci.yml`.
- **Aplicar migraciones:** por la Management API de Supabase (`POST /v1/projects/{ref}/database/query`). Requiere el token `sbp_…` de Ricardo.
- **Desplegar Edge Functions:** `POST /v1/projects/{ref}/functions/deploy?slug=…` (multipart metadata+file).
- **Regla de datos del freeze:** CERO filas en `profiles`/`picks` que no sean personas reales. Nada de usuarios/picks inventados. Editoriales = `source=editorial`, sin picks falsos.

---

## 7. Problemas conocidos / a arreglar (lo que Ricardo quiere pulir)
1. **NADA de lo construido hoy está desplegado en producción.** El deploy a Vercel necesita el **token `vcp_`** de Ricardo (el CLI está deslogueado y el repo NO tiene auto-deploy desde GitHub). Hasta desplegar, www.vinko.fun muestra la versión vieja (solo login + home "Alfa privada").
2. **Magic link devuelve al login** (bug reportado). Causa: flujo PKCE frágil (el `code` necesita el verifier del mismo navegador; el correo lo rompe). En **free tier no se pueden editar las plantillas de email** para pasar a `token_hash` (Supabase exige plan de pago o SMTP propio). **Fix correcto: configurar SMTP propio (Resend)** → permite plantilla `token_hash` robusta + fiabilidad de entrega. Mientras tanto, **Google login funciona bien** y es lo recomendado para la demo.
3. **Admin:** los paneles `/admin/*` requieren `profiles.role='admin'`. Ricardo ya está puesto como admin.
4. **Agente de tendencias:** el pipeline (señal→cola→aprobación→publicar) funciona con plantilla. Para generación buena hace falta `ANTHROPIC_API_KEY` en los secretos de la función. Los **conectores externos** (Google Trends, YouTube Data API, X, TikTok, noticias) NO están: necesitan claves/cuentas y un worker (Railway) que inserte en `signals`. Recomendación de recorte para MVP: **calendarios deportivos + Google Trends + YouTube + audiencias TV**; X/TikTok después.
5. **Display AdSense:** cableado pero apagado (`ADS_ENABLED` por defecto false) y sin feed donde colocarlo; además los anuncios reales solo sirven tras aprobación de Google. El rewarded funciona con "house ad" (placeholder) y acredita igual.
6. **CLAUDE.md / specs dicen "Netlify"** — es Vercel. Actualizar cuando se pueda.

---

## 8. Env vars (Vercel)
Necesarias (públicas, del frontend):
```
NEXT_PUBLIC_SUPABASE_URL=https://uarnpxjdccbidgzhhavc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key, pública>
NEXT_PUBLIC_SITE_URL=https://www.vinko.fun
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<clave pública VAPID>   # hay fallback en el código
# opcionales: NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_ADSENSE_CLIENT
```
NUNCA en Vercel: el `service_role` de Supabase (solo vive en las Edge Functions).

---

## 9. Credenciales (las tiene Ricardo — pedírselas, no están aquí)
- Token Vercel `vcp_…` (deploy).
- Token Supabase Management `sbp_…` (migraciones/funciones).
- API Hostinger (DNS).
- Google OAuth: proyecto `vinko-508710`, client en Supabase (Auth→Google, ya activo). Falta **publicar la app a Production** (`console.cloud.google.com/auth/audience?project=vinko-508710`) para que cualquiera entre con Google.
- Pendientes de crear: `ANTHROPIC_API_KEY` (Haiku), cuenta Resend (SMTP), claves de YouTube/X/Apify (agente).
> Todos los tokens que se hayan pegado en chats deben **rotarse** al terminar.

---

## 10. Orden sugerido para retomar
1. **Desplegar a Vercel** (token `vcp_`) → ver todo en vivo. Verificar env vars.
2. **Google a Production** → que entren los 50 amigos.
3. **Resend SMTP** → magic link robusto (plantilla token_hash) + fiabilidad.
4. Probar el loop completo con un usuario real: login → /hoy pique → /nueva crear → compartir → pick → resolver → liga/grupo.
5. `ANTHROPIC_API_KEY` + 1 conector (Google Trends o calendario) para que el agente llene el buffer solo (con aprobación humana).
