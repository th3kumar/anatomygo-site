#!/usr/bin/env bash
set -euo pipefail
# This runner creates a disposable database. Never point it at hosted production.
case "${PGHOST:-}" in localhost|127.0.0.1) ;; *) echo 'Set PGHOST=127.0.0.1 for a local PostgreSQL server.' >&2; exit 1;; esac
cd "$(dirname "$0")/../.."
playground_test_db="playground_check_${$}_${RANDOM}"
createdb "$playground_test_db"
trap 'dropdb --if-exists "$playground_test_db" >/dev/null' EXIT
psql -d "$playground_test_db" -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql
for migration in supabase/migrations/*.sql; do psql -d "$playground_test_db" -v ON_ERROR_STOP=1 -f "$migration"; done
psql -d "$playground_test_db" -v ON_ERROR_STOP=1 -f supabase/tests/permissions.sql
