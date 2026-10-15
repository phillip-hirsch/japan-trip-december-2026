#!/usr/bin/env bash
set -u
base="${1:-http://localhost:3000}"
tmp="$(mktemp -d)"

echo "URL $base"
echo
echo "## GET / without Cf-Access-Jwt-Assertion (follows at most one redirect)"
curl -sS -L --max-redirs 1 -D - -o "$tmp/no-header.body" --max-time 120 "$base/"
echo "## first 200 body bytes"
head -c 200 "$tmp/no-header.body"
echo
echo
echo "## GET / with Cf-Access-Jwt-Assertion: not-a-jwt"
curl -sS -D - -o "$tmp/garbage.body" --max-time 60 -H 'Cf-Access-Jwt-Assertion: not-a-jwt' "$base/"
echo "## body"
head -c 200 "$tmp/garbage.body"
echo
echo
echo "## GET /_headers without Cf-Access-Jwt-Assertion"
curl -sS -D - -o "$tmp/headers-file.body" --max-time 60 "$base/_headers"
echo "## first 200 body bytes"
head -c 200 "$tmp/headers-file.body"
echo
