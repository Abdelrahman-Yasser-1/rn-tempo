#!/usr/bin/env bash
# Smoke test of a running team server (container or process), over plain HTTP, with curl and jq only.
#
#   BASE_URL      where the server answers (default http://127.0.0.1:8080)
#   OWNER_CMD     a command that creates the owner and reads the password on stdin, for example
#                 "docker exec -i tempo tempo-local-backend server owner create --email owner@example.com --password-stdin"
#
# Steps: health, create the owner, sign in, create the demo backend, read its public API under /b/demo, invite a viewer and an
# editor, the viewer gets 403 on a write and the editor 201, the audit shows the write, a read-definition API key reads the
# definition and gets 403 on a write. No password, cookie or key is printed.
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
: "${OWNER_CMD:?set OWNER_CMD to the command that creates the owner (it reads the password on stdin)}"
PASSWORD="smoke-test-password-$(date +%s)"
JAR="$(mktemp)"
trap 'rm -f "$JAR" "$JAR".*' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

# Waits for the health check.
for _ in $(seq 1 60); do
  curl -fsS "$BASE_URL/__health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "$BASE_URL/__health" | jq -e '.ok == true' >/dev/null || fail "health check"
ok "health"

printf '%s\n' "$PASSWORD" | eval "$OWNER_CMD" >/dev/null || fail "owner create"
ok "owner created from the CLI"

# A signed-in call. $1 = cookie jar, $2 = csrf file, then method, path, optional body. Prints "status body".
call() {
  local jar="$1" csrf="$2" method="$3" path="$4" body="${5:-}"
  local args=(-sS -b "$jar" -o "$jar.out" -w '%{http_code}' -X "$method" -H "Origin: $BASE_URL" -H "x-csrf-token: $(cat "$csrf")")
  [ -n "$body" ] && args+=(-H 'content-type: application/json' --data "$body")
  curl "${args[@]}" "$BASE_URL$path"
}
login() {
  local jar="$1" csrf="$2" email="$3" pass="$4"
  local code
  code=$(curl -sS -c "$jar" -o "$jar.out" -w '%{http_code}' -X POST -H "Origin: $BASE_URL" -H 'content-type: application/json' --data "$(jq -nc --arg e "$email" --arg p "$pass" '{email:$e,password:$p}')" "$BASE_URL/__session")
  [ "$code" = 200 ] || return 1
  jq -r .csrf "$jar.out" >"$csrf"
}

login "$JAR" "$JAR.csrf" owner@example.com "$PASSWORD" || fail "owner login"
ok "owner signed in"
[ "$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{"email":"owner@example.com","password":"wrong wrong wrong"}' -H "Origin: $BASE_URL" "$BASE_URL/__session")" = 401 ] || fail "a wrong password must be refused"

[ "$(call "$JAR" "$JAR.csrf" POST /__hub/backends '{"id":"demo","name":"Demo","preset":"products"}')" = 201 ] || fail "create backend"
ok "backend demo created"
[ "$(curl -sS -o "$JAR.pub" -w '%{http_code}' "$BASE_URL/b/demo/products")" = 200 ] || fail "public API"
jq -e '.products | length > 0' "$JAR.pub" >/dev/null || fail "public API has no products"
ok "/b/demo/products answers"

# A person invited with a one-time link chooses a password, then signs in.
invite() {
  local email="$1" role="$2" jar="$3"
  [ "$(call "$JAR" "$JAR.csrf" POST /__hub/backends/demo/members "$(jq -nc --arg e "$email" --arg r "$role" '{email:$e,role:$r}')")" = 201 ] || fail "invite $role"
  local token
  token=$(jq -r .setup.token "$JAR.out")
  [ "$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "Origin: $BASE_URL" -H 'content-type: application/json' --data "$(jq -nc --arg t "$token" --arg p "$PASSWORD" '{token:$t,password:$p}')" "$BASE_URL/__setup")" = 200 ] || fail "setup link"
  login "$jar" "$jar.csrf" "$email" "$PASSWORD" || fail "$role login"
}
invite viewer@example.com viewer "$JAR.viewer"
invite editor@example.com editor "$JAR.editor"
ok "invited a viewer and an editor"

[ "$(call "$JAR.viewer" "$JAR.viewer.csrf" POST /__admin/b/demo/data/products '{"title":"By the viewer","price":1}')" = 403 ] || fail "viewer write must be 403"
ok "viewer write is 403"
[ "$(call "$JAR.editor" "$JAR.editor.csrf" POST /__admin/b/demo/data/products '{"title":"By the editor","price":2}')" = 201 ] || fail "editor write must be 201"
ok "editor write is 201"

[ "$(call "$JAR" "$JAR.csrf" GET '/__hub/backends/demo/audit?actor=editor@')" = 200 ] || fail "audit"
jq -e '[.entries[] | select(.action == "POST /data/:collection" and .actor.label == "editor@example.com" and .status == 201)] | length == 1' "$JAR.out" >/dev/null || fail "the audit does not show the editor's write"
ok "audit shows the write"

[ "$(call "$JAR" "$JAR.csrf" POST /__hub/backends/demo/api-keys '{"name":"ci","scope":"read-definition"}')" = 201 ] || fail "api key"
KEY=$(jq -r .key "$JAR.out")
[ "$(curl -sS -o "$JAR.def" -w '%{http_code}' -H "Authorization: Bearer $KEY" "$BASE_URL/__admin/b/demo/definition")" = 200 ] || fail "read-definition key must read the definition"
jq -e '.name == "Demo"' "$JAR.def" >/dev/null || fail "definition"
[ "$(curl -sS -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $KEY" -H 'content-type: application/json' --data @"$JAR.def" "$BASE_URL/__admin/b/demo/definition")" = 403 ] || fail "read-definition key must not write"
ok "read-definition key reads and cannot write"
echo "team server smoke test passed"
