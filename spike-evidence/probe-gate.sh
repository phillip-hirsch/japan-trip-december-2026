#!/usr/bin/env bash
set -u
base="${1:-http://localhost:3010}"

probe() {
  local label="$1"
  shift
  echo "=== $label"
  echo "\$ curl -sS -L --max-redirs 1 -D - $* $base$path"
  local body
  body="$(mktemp)"
  curl -sS -L --max-redirs 1 -D - -o "$body" -w 'final_status=%{http_code} redirects=%{num_redirects}\n' "$@" "$base$path"
  echo "--- first 200 body bytes"
  head -c 200 "$body"
  echo
  if grep -qE '^(Forbidden|Access check unavailable)$' "$body"; then
    echo "--- body is a gate refusal: $(head -c 40 "$body")"
  fi
  rm -f "$body"
  echo
}

path=/
probe 'GET / with no JWT header'
probe 'GET / with Cf-Access-Jwt-Assertion: not-a-jwt' -H 'Cf-Access-Jwt-Assertion: not-a-jwt'
path=/_headers
probe 'GET /_headers'
