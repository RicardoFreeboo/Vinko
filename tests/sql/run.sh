#!/usr/bin/env bash
# Corre TODAS las migraciones en un Postgres 16 local efímero (stubs de auth/
# cron/net) y después los tests SQL (tests/sql/*.test.sql). Valida de verdad la
# sintaxis y el comportamiento de las funciones (make_pick, retos, reparto).
#   bash tests/sql/run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGDIR="${PGDIR:-/tmp/vinko-pg}"
PORT="${PGPORT_TEST:-54333}"
BIN="$(ls -d /usr/lib/postgresql/*/bin | head -1)"
export PGHOST=localhost PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres

# initdb/pg_ctl no corren como root: si lo somos, van vía el usuario postgres.
if [ "$(id -u)" = 0 ]; then
  RUN() { su -s /bin/bash postgres -c "$*"; }
else
  RUN() { bash -c "$*"; }
fi
stop() { RUN "'$BIN/pg_ctl' -D '$PGDIR' stop -m immediate" >/dev/null 2>&1 || true; }
trap stop EXIT
stop; rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown "$(id -u postgres 2>/dev/null || id -u)" "$PGDIR" 2>/dev/null || true
RUN "'$BIN/initdb' -D '$PGDIR' -U postgres -A trust" >/dev/null
RUN "'$BIN/pg_ctl' -D '$PGDIR' -o '-p $PORT -c listen_addresses=localhost -c fsync=off' -l '$PGDIR/log' start" >/dev/null

psql -v ON_ERROR_STOP=1 -q -f "$ROOT/tests/sql/stubs.sql"

fail=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  # pg_cron/pg_net no existen en local: se quita su create extension (stubs ya montados)
  sed -E 's/create extension if not exists (pg_cron|pg_net);//I' "$f" > /tmp/mig.sql
  if ! psql -v ON_ERROR_STOP=1 -q -f /tmp/mig.sql > /tmp/mig.out 2>&1; then
    echo "✗ $(basename "$f")"; cat /tmp/mig.out; fail=1; break
  fi
done
[ "$fail" = 0 ] && echo "✓ ${f##*migrations/} y anteriores: todas las migraciones aplican"

if [ "$fail" = 0 ]; then
  for t in "$ROOT"/tests/sql/*.test.sql; do
    [ -e "$t" ] || continue
    if psql -v ON_ERROR_STOP=1 -q -f "$t" > /tmp/t.out 2>&1; then
      echo "✓ $(basename "$t")"; grep -E "^(NOTICE|INFO)" /tmp/t.out | head -5 || true
    else
      echo "✗ $(basename "$t")"; cat /tmp/t.out; fail=1
    fi
  done
fi
exit $fail
