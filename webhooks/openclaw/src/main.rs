mod dedup;
mod handler;
mod prompt;
mod verify;

use axum::{Router, routing::post};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
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
    assert!(!secret.trim().is_empty(), "INDEX_WEBHOOK_SECRET must not be empty");
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".into())
        .parse()
        .expect("PORT must be a valid number");

    let state = Arc::new(AppState {
        secret,
        seen: SeenSet::new(),
    });

    // Background task: evict expired dedup entries every 60 seconds to bound memory.
    {
        let seen = Arc::clone(&state);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                seen.seen.sweep();
            }
        });
    }

    let app = Router::new()
        .route("/index/webhook", post(handler::handle))
        .with_state(state);

    let addr = SocketAddr::from(([0u16, 0, 0, 0, 0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await.unwrap();
    tracing::info!("Listening on {addr}");
    axum::serve(listener, app).await.unwrap();
}
