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

    let addr = SocketAddr::from(([0u16, 0, 0, 0, 0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await.unwrap();
    tracing::info!("Listening on {addr}");
    axum::serve(listener, app).await.unwrap();
}
