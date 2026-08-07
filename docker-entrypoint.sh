#!/bin/sh
set -e

# Seed a writable managed env file so the Admin UI has a starting point.
# A bind-mounted host ./.env or a named volume at /app/.env is preserved;
# anything else (for example an empty directory Docker auto-created for a
# missing bind source) is replaced with the bundled example.
if [ ! -f /app/.env ]; then
  if [ -e /app/.env ]; then
    echo "warning: /app/.env is not a regular file; replacing it" >&2
    rm -rf /app/.env
  fi
  cp /app/.env.example /app/.env
fi

exec "$@"
