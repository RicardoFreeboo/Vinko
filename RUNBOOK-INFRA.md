# RUNBOOK-INFRA · Vinko

Cómo levantar entornos, qué secretos hacen falta y cómo se despliega. Alcance:
**infraestructura multi-entorno** (local → staging → prod) y el gate de CI. No
cubre el desmontaje del dinero (rama `claude/solo-puntos`) ni la multi-región
(des-hardcodear `Europe/Madrid`).

## Arquitectura

- **Front/SSR**: Next.js 15 (App Router) en Vercel.
- **Backend**: Supabase (Postgres + RLS + RPCs security-definer + Edge Functions
  Deno + pg_cron + pg_net). La app habla con Postgres solo vía PostgREST
  (`@supabase/ssr`); sin pools propios ni Realtime.
- **Deploy**: Vercel ↔ GitHub (auto en `main`) + `.github/workflows/supabase-deploy.yml`
  para BD y Edge Functions. El gate de CI vive en `.github/workflows/ci.yml`.

## Los tres entornos

| Entorno  | Supabase                | Front                  | Migraciones (`MIGRATIONS_FROM`) |
| -------- | ----------------------- | ---------------------- | ------------------------------- |
| local    | `supabase start` (local)| `next dev`             | `supabase db reset` (0001→N)    |
| staging  | proyecto Supabase aparte| Vercel **Preview**     | `1` (o `db reset`)              |
| prod     | proyecto de producción  | Vercel **Production**  | `55` (default; las ≥55 son idempotentes) |

Cada entorno apunta a **su** proyecto Supabase y a **sus** Edge Functions: los
crons construyen la URL desde `internal.config.functions_base_url` (nunca
hardcodeada), así que una BD de staging jamás llama a las funciones de prod.

## Inventario de secretos

| Secreto / variable               | Almacén                     | ¿Obligatorio?        | Notas |
| -------------------------------- | --------------------------- | -------------------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Vercel (Preview+Prod)       | **Sí**               | Pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Vercel (Preview+Prod)       | **Sí**               | Pública |
| `SUPABASE_SERVICE_ROLE_KEY`      | Edge (Supabase secrets)     | **Sí**               | Nunca en cliente |
| `CRON_SECRET`                    | Edge (Supabase secrets)     | **Sí**               | Debe igualar `internal.secrets.cron_secret` |
| `internal.secrets.cron_secret`   | BD (tabla)                  | **Sí**               | `npm run seed-secrets` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`   | Vercel (Preview+Prod)       | **Sí** (push)        | Debe casar con la privada |
| `VAPID_PRIVATE_KEY`              | Edge (Supabase secrets)     | **Sí** (push)        | `npm run check-vapid` |
| `SUPABASE_ACCESS_TOKEN`          | GitHub Actions (secret)     | **Sí** (deploy)      | Token personal |
| `SUPABASE_PROJECT_REF`           | GitHub Actions (variable)   | **Sí** (deploy)      | Ref del proyecto destino |
| `MIGRATIONS_FROM`                | GitHub Actions (variable)   | No (default 55)      | `1` en proyecto nuevo |
| `SUPABASE_DB_URL`                | GitHub Actions (secret)     | No                   | Si está, migra por psql |
| `internal.config.functions_base_url` | BD (tabla)             | **Sí** (crons)       | La siembra el workflow por entorno |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | Vercel                   | Opcional             | Analítica |
| `SENTRY_DSN`                     | Vercel / Edge               | Opcional             | Errores |
| `ANTHROPIC_API_KEY`              | Edge (Supabase secrets)     | Opcional             | Solo agente/voz |

**Fuera de alcance (no sembrar aquí):** `STRIPE_*`, `MONEY_PROVIDER_*` → dinero,
rama `claude/solo-puntos`.

Si falta o descuadra un secreto, **no es un 403 silencioso**: `/admin/health`
(vía `system_health()`) lo marca en rojo —`cron_secret`, URL de funciones, clave
VAPID— y cuenta los errores de cron de las últimas 24 h.

## Levantar un entorno NUEVO (staging) desde cero

1. **Proyecto Supabase** nuevo (región UE). Anota su `ref`.
2. **Migraciones desde cero** — idéntico a prod. Dos caminos:
   - CLI (recomendado en local): `supabase link --project-ref <ref>` y
     `supabase db reset` (aplica `0001`→`N`).
   - Workflow: define la variable `MIGRATIONS_FROM=1` y lanza
     `supabase-deploy.yml` (Actions → Run) apuntando al nuevo `ref`.
   - CI ya garantiza que las migraciones aplican limpias desde cero
     (`tests/sql/run.sh` en cada PR).
3. **Config de funciones**: el workflow siembra `internal.config.functions_base_url`
   con `https://<ref>.supabase.co/functions/v1`. (Manual:
   `insert into internal.config(key,value) values('functions_base_url', 'https://<ref>.supabase.co/functions/v1') on conflict (key) do update set value=excluded.value;`)
4. **Secretos de BD**: `CRON_SECRET=<valor> SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=<ref> npm run seed-secrets`.
5. **Secretos de Edge** (Supabase → Edge Functions → Secrets): `SUPABASE_SERVICE_ROLE_KEY`,
   `CRON_SECRET` (el MISMO del paso 4), `VAPID_PRIVATE_KEY`, y `ANTHROPIC_API_KEY` si
   se usa el agente. Valida el par: `NEXT_PUBLIC_VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… npm run check-vapid`.
6. **Edge Functions**: las despliega el workflow (todas las del producto). Manual:
   `SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=<ref> node scripts/deploy-edge.mjs <slug> [--verify-jwt]`.
7. **Vercel Preview**: define las `NEXT_PUBLIC_*` del entorno (incluida la pública
   VAPID) en el scope **Preview**.

## Local

```bash
cp .env.example .env.local      # rellena las NEXT_PUBLIC_* y las de Edge para dev
supabase start                  # Postgres + Edge local
supabase db reset               # aplica 0001→N (idéntico a prod)
npm run dev
```

## Desplegar

- **Front**: push a `main` → Vercel despliega Production; cada PR → Preview.
- **BD + Edge Functions**: push a `main` que toque `supabase/**` (o Actions → Run)
  → `supabase-deploy.yml` aplica migraciones (`≥ MIGRATIONS_FROM`), siembra
  `functions_base_url` y despliega **todas** las funciones del producto
  (`push-dispatch`, `account-purge`, `billing-webhook`, `rewards-claim`,
  `trend-generate`, `voice-porra`). `money-webhook` queda fuera (dinero).
- **Gate de CI** (`ci.yml`, bloquea el merge): `node scripts/predeploy.mjs`
  (léxico → términos prohibidos → i18n → unit → invariante de esquema → par
  VAPID → SQL desde cero → ESLint → tsc → build) + Postgres para `tests/sql`.

### Nota sobre el historial de migraciones (prod)

Prod aplicó `0001–0059` por fuera del historial de la CLI; por eso el workflow usa
un **umbral idempotente** (`MIGRATIONS_FROM=55`) en vez de `supabase db push`.
Para adoptar el historial versionado de la CLI (recomendado a futuro):

```bash
supabase link --project-ref <ref-prod>
supabase migration repair --status applied 0001 … 0059   # marca lo ya aplicado
supabase db push                                          # aplica solo lo nuevo (0060+)
```

Hazlo **una vez** y con cuidado: marca como aplicadas solo las migraciones que
prod ya tiene. A partir de ahí, `db push` aplica únicamente las nuevas y puedes
bajar `MIGRATIONS_FROM`. Las migraciones `0009`/`0022` se editaron para quitar la
URL de prod hardcodeada; la línea base del `repair` será ese contenido ya limpio.

## Observabilidad de crons

- `internal.cron_http_log`: cada `net.http_post` de un cron con su `request_id`;
  `internal.cron_http_reconcile()` (cron cada 5 min) cruza con `net._http_response`
  y registra los `status ≥ 300`.
- `internal.cron_errors`: errores de las sub-tareas de `cron_tick()` (ya no se
  tragan con `exception when others then null`) y los HTTP fallidos.
- `/admin/health` resume todo: un cron que falla es **visible**.
