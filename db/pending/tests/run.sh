#!/usr/bin/env bash
# Ejecuta las pruebas de las migraciones pendientes en un clúster PostgreSQL efímero (no toca ninguna base real).
set -euo pipefail
cd "$(dirname "$0")"
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
TMP=$(mktemp -d)
AS=()
if [ "$(id -u)" = 0 ]; then chown postgres "$TMP"; chmod 755 "$TMP"; AS=(runuser -u postgres --); fi
trap '"${AS[@]}" "$BIN/pg_ctl" -D "$TMP/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
"${AS[@]}" "$BIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$TMP/data" -o "-k $TMP -p 55432 -c listen_addresses=''" -l "$TMP/log" start >/dev/null
for t in run_tests.sql; do
  "$BIN/createdb" -h "$TMP" -p 55432 -U postgres coamo_pending
  psql -h "$TMP" -p 55432 -U postgres -d coamo_pending -v ON_ERROR_STOP=1 -q -t -f "$t"
  "$BIN/dropdb" -h "$TMP" -p 55432 -U postgres coamo_pending
done
