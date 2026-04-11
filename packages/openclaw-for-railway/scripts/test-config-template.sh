#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$REPO_ROOT/config.json5.template"

if [ ! -f "$TEMPLATE" ]; then
  echo "FAIL: $TEMPLATE does not exist"
  exit 1
fi

if ! command -v envsubst >/dev/null 2>&1; then
  echo "FAIL: envsubst not installed (apt-get install gettext-base)"
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Fixture env vars
export PORT=18789
export OPENCLAW_GATEWAY_TOKEN="test-gateway-token"
export OPENCLAW_HOOKS_TOKEN="test-hooks-token"
export OPENCLAW_PROVIDER="openai"
export RAILWAY_PUBLIC_DOMAIN="example.up.railway.app"

envsubst < "$TEMPLATE" > "$TMP"

# Assertions — grep for literal substituted values
grep -q 'port: 18789' "$TMP" || { echo "FAIL: PORT not substituted"; exit 1; }
grep -q '"test-gateway-token"' "$TMP" || { echo "FAIL: OPENCLAW_GATEWAY_TOKEN not substituted"; exit 1; }
grep -q '"test-hooks-token"' "$TMP" || { echo "FAIL: OPENCLAW_HOOKS_TOKEN not substituted"; exit 1; }
grep -q '"https://example.up.railway.app"' "$TMP" || { echo "FAIL: RAILWAY_PUBLIC_DOMAIN not substituted"; exit 1; }
grep -q 'provider: "openai"' "$TMP" || { echo "FAIL: OPENCLAW_PROVIDER not substituted in memorySearch"; exit 1; }

# Structural assertions — config must contain all required sections
for key in 'gateway:' 'hooks:' 'plugins:' 'agents:' 'memorySearch:' 'controlUi:' 'bindAddress: "0.0.0.0"' 'mode: "token"' 'enabled: true'; do
  grep -q "$key" "$TMP" || { echo "FAIL: missing required key/value: $key"; exit 1; }
done

echo "OK: config.json5.template renders correctly with all required sections"
