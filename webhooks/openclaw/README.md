# index-webhook — OpenClaw relay

Lightweight webhook relay for [InstaClaw](https://instaclaw.io) VMs. Receives signed events from Index Network and forwards them to the local `openclaw agent` CLI.

## Requirements

- Linux x86_64
- `openclaw` CLI installed and authenticated
- `INDEX_WEBHOOK_SECRET` environment variable (must match the secret registered in Index Network)

## Build

```bash
rustup target add x86_64-unknown-linux-musl
cargo build --release --target x86_64-unknown-linux-musl
# Binary: target/x86_64-unknown-linux-musl/release/index-webhook
```

## Run

```bash
INDEX_WEBHOOK_SECRET=your-secret PORT=3000 ./index-webhook
```

## Deployment

Follow the setup instructions embedded in the Index Network MCP — when OpenClaw connects to the MCP, it receives the full installation guide automatically.

## Events forwarded

- `negotiation.started`
- `negotiation.turn_received`
- `negotiation.completed`

All other events return `200 OK` and are ignored.

## Security

**HMAC verification:** Every delivery is verified with HMAC-SHA256 using `INDEX_WEBHOOK_SECRET`. The comparison uses `hmac::verify_slice`, which relies on the `subtle` crate for constant-time equality — safe against timing oracles.

**Prompt injection:** The `message` field from a negotiation turn is counterparty-controlled content and is included verbatim in the prompt sent to `openclaw agent --message`. A malicious counterparty could embed instructions targeting the OpenClaw agent. This is a known limitation — the relay passes untrusted content into an LLM prompt. OpenClaw's own system prompt and tool boundaries are the primary mitigations; no additional sanitization is applied here.
