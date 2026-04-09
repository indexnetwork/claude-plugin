# OpenClaw Webhook Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Rust webhook relay at `webhooks/openclaw/` that receives signed Index Network events and forwards them to the local `openclaw agent` CLI, and embed InstaClaw setup instructions in the Index MCP server so OpenClaw knows what to do immediately after installing the MCP.

**Architecture:** A statically-linked axum HTTP server binds on `[::]` (IPv6 wildcard), verifies HMAC-SHA256 signatures, deduplicates deliveries via an in-memory TTL seen-set, builds a structured prompt from the event, and spawns `openclaw agent --message` as a background subprocess. The MCP server's `instructions` field is updated with the full InstaClaw onboarding flow so OpenClaw reads it at connection time.

**Tech Stack:** Rust, axum 0.7, tokio 1, hmac 0.12, sha2 0.10, hex 0.4, serde/serde_json 1, dashmap 5; TypeScript for the MCP instructions update.

---

## File Map

| Path | Action | Responsibility |
|------|--------|---------------|
| `webhooks/openclaw/Cargo.toml` | Create | Crate manifest and dependencies |
| `webhooks/openclaw/.cargo/config.toml` | Create | Default build target (musl) |
| `webhooks/openclaw/src/main.rs` | Create | Server startup, state init, axum routing |
| `webhooks/openclaw/src/verify.rs` | Create | HMAC-SHA256 signature verification |
| `webhooks/openclaw/src/dedup.rs` | Create | In-memory TTL dedup seen-set |
| `webhooks/openclaw/src/prompt.rs` | Create | Event parsing and prompt string building |
| `webhooks/openclaw/src/handler.rs` | Create | Request handler — wires all modules |
| `packages/protocol/src/mcp/mcp.server.ts` | Modify | Add `instructions` field with InstaClaw setup |

---

## Task 1: Scaffold Rust project

**Files:**
- Create: `webhooks/openclaw/Cargo.toml`
- Create: `webhooks/openclaw/.cargo/config.toml`
- Create: `webhooks/openclaw/src/main.rs`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p webhooks/openclaw/src webhooks/openclaw/.cargo
```

- [ ] **Step 2: Write `Cargo.toml`**

```toml
[package]
name = "index-webhook-relay"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "index-webhook"
path = "src/main.rs"

[dependencies]
axum = { version = "0.7", features = ["tokio"] }
tokio = { version = "1", features = ["full"] }
hmac = "0.12"
sha2 = "0.10"
hex = "0.4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dashmap = "5"
tower-http = { version = "0.5", features = ["trace"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[dev-dependencies]
axum-test = "14"
```

- [ ] **Step 3: Write `.cargo/config.toml`**

```toml
[build]
target = "x86_64-unknown-linux-musl"
```

- [ ] **Step 4: Write minimal `src/main.rs`** (compiles and responds 200)

```rust
mod dedup;
mod handler;
mod prompt;
mod verify;

use axum::{Router, routing::post};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

use dedup::SeenSet;

pub struct AppState {
    pub secret: String,
    pub seen: SeenSet,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let secret = std::env::var("INDEX_WEBHOOK_SECRET")
        .expect("INDEX_WEBHOOK_SECRET must be set");
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".into())
        .parse()
        .expect("PORT must be a valid number");

    let state = Arc::new(AppState {
        secret,
        seen: SeenSet::new(),
    });

    let app = Router::new()
        .route("/index/webhook", post(handler::handle))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await.unwrap();
    tracing::info!("Listening on {addr}");
    axum::serve(listener, app).await.unwrap();
}
```

- [ ] **Step 5: Verify it compiles** (stub out missing modules first with empty files)

```bash
touch webhooks/openclaw/src/verify.rs \
      webhooks/openclaw/src/dedup.rs \
      webhooks/openclaw/src/prompt.rs \
      webhooks/openclaw/src/handler.rs
cd webhooks/openclaw && cargo check 2>&1
```

Expected: warnings about unused items, no errors.

- [ ] **Step 6: Commit scaffold**

```bash
git add webhooks/openclaw/
git -c commit.gpgsign=false commit -m "chore(webhook): scaffold openclaw webhook relay"
```

---

## Task 2: HMAC signature verification (`src/verify.rs`)

**Files:**
- Modify: `webhooks/openclaw/src/verify.rs`

The `X-Index-Signature` header format is `sha256=<lowercase-hex>`. We must verify before parsing JSON.

- [ ] **Step 1: Write the failing test**

```rust
// src/verify.rs
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Returns true if the raw body matches the given signature header.
/// Header format: "sha256=<hex>". Returns false on any parse or mismatch.
pub fn verify_signature(secret: &str, body: &[u8], header: &str) -> bool {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_signature_passes() {
        // Pre-computed: HMAC-SHA256("mysecret", b"hello") = ...
        // Generate with: echo -n "hello" | openssl dgst -sha256 -hmac "mysecret"
        let body = b"hello";
        let secret = "mysecret";
        // Compute expected
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        let expected_hex = hex::encode(mac.finalize().into_bytes());
        let header = format!("sha256={expected_hex}");

        assert!(verify_signature(secret, body, &header));
    }

    #[test]
    fn wrong_signature_fails() {
        assert!(!verify_signature("mysecret", b"hello", "sha256=deadbeef"));
    }

    #[test]
    fn missing_prefix_fails() {
        assert!(!verify_signature("mysecret", b"hello", "deadbeef"));
    }

    #[test]
    fn empty_header_fails() {
        assert!(!verify_signature("mysecret", b"hello", ""));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd webhooks/openclaw && cargo test verify 2>&1
```

Expected: compile error on `todo!()` or test panics.

- [ ] **Step 3: Implement `verify_signature`**

```rust
pub fn verify_signature(secret: &str, body: &[u8], header: &str) -> bool {
    let hex_digest = match header.strip_prefix("sha256=") {
        Some(h) => h,
        None => return false,
    };
    let provided = match hex::decode(hex_digest) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(body);
    // verify_slice uses constant-time comparison internally
    mac.verify_slice(&provided).is_ok()
}
```

- [ ] **Step 4: Run tests**

```bash
cd webhooks/openclaw && cargo test verify 2>&1
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add webhooks/openclaw/src/verify.rs
git -c commit.gpgsign=false commit -m "feat(webhook): add HMAC-SHA256 signature verification"
```

---

## Task 3: Dedup seen-set (`src/dedup.rs`)

**Files:**
- Modify: `webhooks/openclaw/src/dedup.rs`

The seen-set stores signatures for 5 minutes to handle BullMQ redeliveries. We use `DashMap<String, Instant>` and check TTL inline (no background cleanup needed for low-volume traffic).

- [ ] **Step 1: Write the failing test**

```rust
// src/dedup.rs
use dashmap::DashMap;
use std::time::{Duration, Instant};

const TTL: Duration = Duration::from_secs(300); // 5 minutes

pub struct SeenSet(DashMap<String, Instant>);

impl SeenSet {
    pub fn new() -> Self {
        Self(DashMap::new())
    }

    /// Returns true if this signature was seen within TTL and inserts it.
    /// Returns false (and inserts) if it's new or expired.
    pub fn check_and_insert(&self, sig: &str) -> bool {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_signature_not_duplicate() {
        let set = SeenSet::new();
        assert!(!set.check_and_insert("sig-abc"));
    }

    #[test]
    fn same_signature_is_duplicate() {
        let set = SeenSet::new();
        set.check_and_insert("sig-abc");
        assert!(set.check_and_insert("sig-abc"));
    }

    #[test]
    fn different_signatures_not_duplicate() {
        let set = SeenSet::new();
        set.check_and_insert("sig-abc");
        assert!(!set.check_and_insert("sig-xyz"));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd webhooks/openclaw && cargo test dedup 2>&1
```

Expected: compile error or panic on `todo!()`.

- [ ] **Step 3: Implement `check_and_insert`**

```rust
pub fn check_and_insert(&self, sig: &str) -> bool {
    let now = Instant::now();
    if let Some(entry) = self.0.get(sig) {
        if now.duration_since(*entry) < TTL {
            return true; // duplicate within TTL
        }
    }
    self.0.insert(sig.to_string(), now);
    false
}
```

- [ ] **Step 4: Run tests**

```bash
cd webhooks/openclaw && cargo test dedup 2>&1
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add webhooks/openclaw/src/dedup.rs
git -c commit.gpgsign=false commit -m "feat(webhook): add in-memory dedup seen-set with TTL"
```

---

## Task 4: Event parsing and prompt building (`src/prompt.rs`)

**Files:**
- Modify: `webhooks/openclaw/src/prompt.rs`

The envelope format is `{ event: string, timestamp: string, payload: object }`. We only act on `negotiation.started`, `negotiation.turn_received`, `negotiation.completed`.

- [ ] **Step 1: Write the failing test**

```rust
// src/prompt.rs
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub struct WebhookEvent {
    pub event: String,
    pub timestamp: String,
    pub payload: Value,
}

/// Events we forward to OpenClaw. All others are ignored.
pub const RELEVANT_EVENTS: &[&str] = &[
    "negotiation.started",
    "negotiation.turn_received",
    "negotiation.completed",
];

pub fn is_relevant(event: &WebhookEvent) -> bool {
    RELEVANT_EVENTS.contains(&event.event.as_str())
}

/// Build the structured prompt string passed to `openclaw agent --message`.
pub fn build_prompt(event: &WebhookEvent) -> String {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_event(event_name: &str, payload: Value) -> WebhookEvent {
        WebhookEvent {
            event: event_name.to_string(),
            timestamp: "2026-04-10T12:00:00.000Z".to_string(),
            payload,
        }
    }

    #[test]
    fn negotiation_turn_is_relevant() {
        let e = make_event("negotiation.turn_received", json!({}));
        assert!(is_relevant(&e));
    }

    #[test]
    fn opportunity_created_is_not_relevant() {
        let e = make_event("opportunity.created", json!({}));
        assert!(!is_relevant(&e));
    }

    #[test]
    fn prompt_contains_event_and_negotiation_id() {
        let e = make_event(
            "negotiation.turn_received",
            json!({ "negotiation_id": "neg-123", "message": "Let's connect" }),
        );
        let prompt = build_prompt(&e);
        assert!(prompt.contains("negotiation.turn_received"));
        assert!(prompt.contains("neg-123"));
        assert!(prompt.contains("Let's connect"));
    }

    #[test]
    fn prompt_handles_missing_optional_fields() {
        let e = make_event("negotiation.started", json!({}));
        let prompt = build_prompt(&e);
        assert!(prompt.contains("negotiation.started"));
        // Should not panic or include "null"
        assert!(!prompt.contains("null"));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd webhooks/openclaw && cargo test prompt 2>&1
```

Expected: compile error or panic on `todo!()`.

- [ ] **Step 3: Implement `build_prompt`**

```rust
pub fn build_prompt(event: &WebhookEvent) -> String {
    let mut lines = vec![
        "Index Network event received.".to_string(),
        String::new(),
        format!("Event: {}", event.event),
        format!("Timestamp: {}", event.timestamp),
    ];

    if let Some(id) = event.payload.get("negotiation_id").and_then(Value::as_str) {
        lines.push(format!("Negotiation ID: {id}"));
    }
    if let Some(msg) = event.payload.get("message").and_then(Value::as_str) {
        lines.push(format!("Message: {msg}"));
    }
    if let Some(opp) = event.payload.get("opportunity_id").and_then(Value::as_str) {
        lines.push(format!("Opportunity ID: {opp}"));
    }

    lines.push(String::new());
    lines.push(
        "You have the Index MCP tools available. Review the negotiation state and take the appropriate next action.".to_string(),
    );

    lines.join("\n")
}
```

- [ ] **Step 4: Run tests**

```bash
cd webhooks/openclaw && cargo test prompt 2>&1
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add webhooks/openclaw/src/prompt.rs
git -c commit.gpgsign=false commit -m "feat(webhook): add event parsing and prompt building"
```

---

## Task 5: Request handler (`src/handler.rs`)

**Files:**
- Modify: `webhooks/openclaw/src/handler.rs`

Wires verify → dedup → parse → filter → build prompt → spawn subprocess.

- [ ] **Step 1: Write the failing test**

```rust
// src/handler.rs
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use std::sync::Arc;

use crate::AppState;
use crate::verify::verify_signature;
use crate::prompt::{WebhookEvent, is_relevant, build_prompt};

pub async fn handle(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum_test::TestServer;
    use axum::{Router, routing::post};
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    use serde_json::json;

    use crate::dedup::SeenSet;

    type HmacSha256 = Hmac<Sha256>;

    fn make_app(secret: &str) -> TestServer {
        let state = Arc::new(AppState {
            secret: secret.to_string(),
            seen: SeenSet::new(),
        });
        let app = Router::new()
            .route("/index/webhook", post(handle))
            .with_state(state);
        TestServer::new(app).unwrap()
    }

    fn sign(secret: &str, body: &[u8]) -> String {
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
    }

    #[tokio::test]
    async fn valid_relevant_event_returns_200() {
        let server = make_app("testsecret");
        let body = json!({
            "event": "negotiation.turn_received",
            "timestamp": "2026-04-10T12:00:00.000Z",
            "payload": { "negotiation_id": "neg-abc" }
        });
        let body_bytes = serde_json::to_vec(&body).unwrap();
        let sig = sign("testsecret", &body_bytes);

        let resp = server
            .post("/index/webhook")
            .add_header("x-index-signature", sig.parse().unwrap())
            .bytes(body_bytes.into())
            .await;

        assert_eq!(resp.status_code(), 200);
    }

    #[tokio::test]
    async fn wrong_signature_returns_401() {
        let server = make_app("testsecret");
        let body = b"{\"event\":\"negotiation.turn_received\",\"timestamp\":\"t\",\"payload\":{}}";
        let resp = server
            .post("/index/webhook")
            .add_header("x-index-signature", "sha256=deadbeef".parse().unwrap())
            .bytes(body.as_ref().into())
            .await;

        assert_eq!(resp.status_code(), 401);
    }

    #[tokio::test]
    async fn irrelevant_event_returns_200_without_spawn() {
        let server = make_app("testsecret");
        let body = json!({
            "event": "opportunity.created",
            "timestamp": "2026-04-10T12:00:00.000Z",
            "payload": {}
        });
        let body_bytes = serde_json::to_vec(&body).unwrap();
        let sig = sign("testsecret", &body_bytes);

        let resp = server
            .post("/index/webhook")
            .add_header("x-index-signature", sig.parse().unwrap())
            .bytes(body_bytes.into())
            .await;

        assert_eq!(resp.status_code(), 200);
    }

    #[tokio::test]
    async fn duplicate_event_returns_200_immediately() {
        let secret = "testsecret";
        let state = Arc::new(AppState {
            secret: secret.to_string(),
            seen: SeenSet::new(),
        });
        let app = Router::new()
            .route("/index/webhook", post(handle))
            .with_state(state);
        let server = TestServer::new(app).unwrap();

        let body = json!({
            "event": "negotiation.turn_received",
            "timestamp": "2026-04-10T12:00:00.000Z",
            "payload": { "negotiation_id": "neg-abc" }
        });
        let body_bytes = serde_json::to_vec(&body).unwrap();
        let sig = sign(secret, &body_bytes);

        // First delivery
        server
            .post("/index/webhook")
            .add_header("x-index-signature", sig.parse::<axum::http::HeaderValue>().unwrap())
            .bytes(body_bytes.clone().into())
            .await;

        // Duplicate delivery
        let resp = server
            .post("/index/webhook")
            .add_header("x-index-signature", sig.parse::<axum::http::HeaderValue>().unwrap())
            .bytes(body_bytes.into())
            .await;

        assert_eq!(resp.status_code(), 200);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd webhooks/openclaw && cargo test handler 2>&1
```

Expected: compile error or panic on `todo!()`.

- [ ] **Step 3: Implement `handle`**

```rust
pub async fn handle(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    // 1. Extract and verify signature
    let sig = match headers.get("x-index-signature").and_then(|v| v.to_str().ok()) {
        Some(s) => s.to_string(),
        None => return StatusCode::UNAUTHORIZED,
    };

    if !verify_signature(&state.secret, &body, &sig) {
        return StatusCode::UNAUTHORIZED;
    }

    // 2. Dedup check
    if state.seen.check_and_insert(&sig) {
        tracing::info!("duplicate delivery, skipping");
        return StatusCode::OK;
    }

    // 3. Parse JSON
    let event: WebhookEvent = match serde_json::from_slice(&body) {
        Ok(e) => e,
        Err(err) => {
            tracing::warn!("failed to parse webhook body: {err}");
            return StatusCode::BAD_REQUEST;
        }
    };

    // 4. Filter
    if !is_relevant(&event) {
        tracing::info!("ignoring event: {}", event.event);
        return StatusCode::OK;
    }

    // 5. Build prompt and spawn openclaw
    let prompt = build_prompt(&event);
    tracing::info!("forwarding event {} to openclaw", event.event);

    tokio::spawn(async move {
        match tokio::process::Command::new("openclaw")
            .args(["agent", "--message", &prompt])
            .spawn()
        {
            Ok(_) => tracing::info!("openclaw agent spawned"),
            Err(err) => tracing::error!("failed to spawn openclaw agent: {err}"),
        }
    });

    StatusCode::OK
}
```

Note: add `use tokio::process::Command;` — requires `tokio` with `process` feature (already included via `features = ["full"]`).

- [ ] **Step 4: Run tests**

```bash
cd webhooks/openclaw && cargo test handler 2>&1
```

Expected: all 4 tests pass. (The `valid_relevant_event_returns_200` test may log a spawn error since `openclaw` isn't present in CI — that's fine, the response is still 200.)

- [ ] **Step 5: Commit**

```bash
git add webhooks/openclaw/src/handler.rs
git -c commit.gpgsign=false commit -m "feat(webhook): add request handler with full pipeline"
```

---

## Task 6: Wire and verify full build

**Files:**
- Modify: `webhooks/openclaw/src/main.rs` (already references all modules)

- [ ] **Step 1: Run all tests**

```bash
cd webhooks/openclaw && cargo test 2>&1
```

Expected: all tests pass.

- [ ] **Step 2: Build release binary**

First, ensure the musl target is installed:

```bash
rustup target add x86_64-unknown-linux-musl
```

Then build:

```bash
cd webhooks/openclaw && cargo build --release 2>&1
```

Expected: `target/x86_64-unknown-linux-musl/release/index-webhook` binary produced.

- [ ] **Step 3: Smoke test the binary**

```bash
INDEX_WEBHOOK_SECRET=test PORT=3099 ./target/x86_64-unknown-linux-musl/release/index-webhook &
sleep 1
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3099/index/webhook \
  -H "x-index-signature: sha256=deadbeef" \
  -d '{}'
# Expected: 401
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add webhooks/openclaw/
git -c commit.gpgsign=false commit -m "feat(webhook): build and verify openclaw webhook relay binary"
```

---

## Task 7: MCP `instructions` field

**Files:**
- Modify: `packages/protocol/src/mcp/mcp.server.ts:120-123`

The `McpServer` constructor accepts an `instructions` string that is sent to connecting clients as part of `InitializeResult`. OpenClaw reads this at connection time.

- [ ] **Step 1: Update `createMcpServer` in `mcp.server.ts`**

Replace the current constructor call at line 120:

```typescript
// Before
const server = new McpServer({
  name: 'index-network',
  version: '1.0.0',
});
```

With:

```typescript
const INSTACLAW_SETUP = `
If you are an OpenClaw agent running on an InstaClaw VM, complete the following setup before using any Index tools:

1. Download the webhook relay binary:
   curl -L https://github.com/indexnetwork/index/releases/latest/download/index-webhook-x86_64-unknown-linux-musl -o /usr/local/bin/index-webhook
   chmod +x /usr/local/bin/index-webhook

2. Generate a webhook secret and write the env file:
   SECRET=$(openssl rand -hex 32)
   printf "INDEX_WEBHOOK_SECRET=$SECRET\\nPORT=3000\\n" | sudo tee /etc/index-webhook.env

3. Write the systemd unit:
   sudo tee /etc/systemd/system/index-webhook.service << 'EOF'
   [Unit]
   Description=Index Network webhook relay for OpenClaw
   After=network.target

   [Service]
   EnvironmentFile=/etc/index-webhook.env
   ExecStart=/usr/local/bin/index-webhook
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   EOF

4. Enable and start the service:
   sudo systemctl daemon-reload
   sudo systemctl enable --now index-webhook
   sudo systemctl status index-webhook

5. Get your public IPv6 address:
   curl -6 ifconfig.me
   # Example output: 2600:3c03::2000:29ff:feb8:d613

6. Register yourself as an agent — call register_agent with:
   - name: "OpenClaw Agent"
   - channel: "webhook"
   - url: "http://[<your-ipv6-from-step-5>]:3000/index/webhook"
   - secret: <the value of $SECRET from step 2 — re-read with: sudo grep INDEX_WEBHOOK_SECRET /etc/index-webhook.env | cut -d= -f2>
   - actions: ["manage:negotiations"]

Setup complete. You can now receive negotiation events from Index Network.
`.trim();

const server = new McpServer({
  name: 'index-network',
  version: '1.0.0',
  instructions: INSTACLAW_SETUP,
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/protocol && bun run build 2>&1
```

Expected: no errors. If `McpServer` options type does not include `instructions`, check the installed version of `@modelcontextprotocol/server`:

```bash
cat packages/protocol/node_modules/@modelcontextprotocol/server/package.json | grep '"version"'
```

The `instructions` field is part of MCP spec ≥ 2024-11-05. If the installed version predates this, update the package:

```bash
cd packages/protocol && bun add @modelcontextprotocol/server@latest
```

Then re-run the build.

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/src/mcp/mcp.server.ts
git -c commit.gpgsign=false commit -m "feat(mcp): add InstaClaw setup instructions to MCP server"
```

---

## Task 8: README for `webhooks/openclaw/`

**Files:**
- Create: `webhooks/openclaw/README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# index-webhook — OpenClaw relay

Lightweight webhook relay for [InstaClaw](https://instaclaw.io) VMs. Receives signed events from Index Network and forwards them to the local `openclaw agent` CLI.

## Requirements

- Linux x86_64
- `openclaw` CLI installed and authenticated
- `INDEX_WEBHOOK_SECRET` environment variable (must match the secret registered in Index Network)

## Build

```bash
rustup target add x86_64-unknown-linux-musl
cargo build --release
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
```

- [ ] **Step 2: Commit**

```bash
git add webhooks/openclaw/README.md
git -c commit.gpgsign=false commit -m "docs(webhook): add README for openclaw webhook relay"
```
