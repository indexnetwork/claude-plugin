#!/bin/sh
# entrypoint.sh — runs at container boot on Railway.
#
#   1. Ensure volume layout.
#   2. On fresh volume, run `openclaw onboard` non-interactively with the
#      user-selected provider (openai or gemini). Skip if marker file exists
#      and OPENCLAW_REONBOARD is not set.
#   3. Render /opt/openclaw-railway/config.json5.template via envsubst into
#      $XDG_CONFIG_HOME/config.json5. This runs on every boot so Railway
#      variable changes always propagate — no stale config on the volume.
#   4. Exec the OpenClaw gateway bound to 0.0.0.0:$PORT.
#
# All variables are supplied by the Railway template dashboard form.
# OPENCLAW_PROVIDER, OPENAI_API_KEY, GEMINI_API_KEY — user-prompted.
# OPENCLAW_GATEWAY_TOKEN, OPENCLAW_HOOKS_TOKEN, GOG_KEYRING_PASSWORD — ${{secret(n)}}.
# PORT, XDG_CONFIG_HOME, RAILWAY_PUBLIC_DOMAIN — Railway-provided or defaults.

set -e

: "${PORT:=18789}"
: "${XDG_CONFIG_HOME:=/data/.openclaw}"
: "${OPENCLAW_RAILWAY_TEMPLATE_DIR:=/opt/openclaw-railway}"

mkdir -p "$XDG_CONFIG_HOME"

MARKER="$XDG_CONFIG_HOME/.railway-onboarded"
if [ -n "${OPENCLAW_PROVIDER:-}" ] && { [ ! -f "$MARKER" ] || [ "${OPENCLAW_REONBOARD:-}" = "1" ]; }; then
  case "$OPENCLAW_PROVIDER" in
    openai)
      : "${OPENAI_API_KEY:?OPENAI_API_KEY required when OPENCLAW_PROVIDER=openai}"
      # --accept-risk is required by openclaw onboard --non-interactive whenever
      # the gateway binds to a non-loopback address. On Railway we bind to
      # 0.0.0.0 so public ingress works; the real auth boundary is the
      # 64-char OPENCLAW_GATEWAY_TOKEN, not the bind mode.
      openclaw onboard --non-interactive --mode local --accept-risk \
        --auth-choice openai-api-key \
        --openai-api-key "$OPENAI_API_KEY" \
        --gateway-port "$PORT" \
        --gateway-bind custom
      ;;
    gemini)
      : "${GEMINI_API_KEY:?GEMINI_API_KEY required when OPENCLAW_PROVIDER=gemini}"
      openclaw onboard --non-interactive --mode local --accept-risk \
        --auth-choice gemini-api-key \
        --gemini-api-key "$GEMINI_API_KEY" \
        --gateway-port "$PORT" \
        --gateway-bind custom
      ;;
    *)
      echo "OPENCLAW_PROVIDER must be 'openai' or 'gemini' (got: '$OPENCLAW_PROVIDER'). Skipping onboarding." >&2
      ;;
  esac
  touch "$MARKER"
fi

envsubst < "$OPENCLAW_RAILWAY_TEMPLATE_DIR/config.json5.template" > "$XDG_CONFIG_HOME/config.json5"

exec node dist/index.js gateway --bind custom --port "$PORT" --allow-unconfigured
