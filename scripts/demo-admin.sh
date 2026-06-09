#!/usr/bin/env bash
# voygent-demo admin CLI — mint / list / revoke / usage for passcodes.
#
# Talks to the same JSON API the browser console (/admin) uses. Handy from the
# terminal; the browser console at https://demo.voygent.ai/admin (Cloudflare Access)
# is the GUI equivalent.
#
# Token resolution (first hit wins):
#   1. $VOYGENT_DEMO_ADMIN_TOKEN
#   2. VOYGENT_DEMO_ADMIN_TOKEN= line in $VOYGENT_LITE_ENV (default ~/dev/voygent-lite/.env)
# Origin override: $DEMO_ORIGIN (default https://demo.voygent.ai)
#
# Usage:
#   scripts/demo-admin.sh mint <id> <label> <dailyUsd> <totalUsd> [view] [expiresAtISO]
#   scripts/demo-admin.sh list
#   scripts/demo-admin.sh revoke <id>
#   scripts/demo-admin.sh usage <id> [sinceISO]
set -euo pipefail

ORIGIN="${DEMO_ORIGIN:-https://demo.voygent.ai}"

resolve_token() {
  if [ -n "${VOYGENT_DEMO_ADMIN_TOKEN:-}" ]; then printf '%s' "$VOYGENT_DEMO_ADMIN_TOKEN"; return; fi
  local env_file="${VOYGENT_LITE_ENV:-$HOME/dev/voygent-lite/.env}"
  if [ -f "$env_file" ]; then
    grep -E '^VOYGENT_DEMO_ADMIN_TOKEN=' "$env_file" | head -1 | cut -d= -f2- | tr -d '"'
  fi
}
TOKEN="$(resolve_token)"
if [ -z "$TOKEN" ]; then
  echo "error: admin token not found. Set \$VOYGENT_DEMO_ADMIN_TOKEN or add VOYGENT_DEMO_ADMIN_TOKEN= to ~/dev/voygent-lite/.env" >&2
  exit 1
fi

pp() { if command -v jq >/dev/null 2>&1; then jq .; else cat; fi; }

# api METHOD PATH [JSON_BODY]
api() {
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -sS -X "$method" "$ORIGIN$path" \
      -H "origin: $ORIGIN" -H "content-type: application/json" -H "authorization: Bearer $TOKEN" \
      --data "$data"
  else
    curl -sS -X "$method" "$ORIGIN$path" \
      -H "origin: $ORIGIN" -H "content-type: application/json" -H "authorization: Bearer $TOKEN"
  fi
}

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

cmd="${1:-}"
case "$cmd" in
  mint)
    id="${2:-}"; label="${3:-}"; daily="${4:-}"; total="${5:-}"; view="${6:-default}"; expires="${7:-}"
    if [ -z "$id" ] || [ -z "$label" ] || [ -z "$daily" ] || [ -z "$total" ]; then
      echo "usage: $0 mint <id> <label> <dailyUsd> <totalUsd> [view] [expiresAtISO]" >&2; exit 2
    fi
    body=$(printf '{"id":"%s","label":"%s","view":"%s","dailyUsd":%s,"totalUsd":%s' \
      "$(json_escape "$id")" "$(json_escape "$label")" "$(json_escape "$view")" "$daily" "$total")
    [ -n "$expires" ] && body="$body,\"expiresAt\":\"$(json_escape "$expires")\""
    body="$body}"
    resp="$(api POST /admin/codes "$body")"
    printf '%s\n' "$resp" | pp
    link=$(printf '%s' "$resp" | grep -o '"link":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$link" ]; then printf '\nInvite link (give this to the guest):\n  %s\n' "$link"; fi
    ;;
  list)
    api GET /admin/codes | pp
    ;;
  revoke)
    id="${2:-}"; [ -z "$id" ] && { echo "usage: $0 revoke <id>" >&2; exit 2; }
    api POST "/admin/codes/$id/revoke" | pp
    ;;
  usage)
    id="${2:-}"; since="${3:-}"; [ -z "$id" ] && { echo "usage: $0 usage <id> [sinceISO]" >&2; exit 2; }
    q=""; [ -n "$since" ] && q="?since=$since"
    api GET "/admin/codes/$id/usage$q" | pp
    ;;
  *)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
