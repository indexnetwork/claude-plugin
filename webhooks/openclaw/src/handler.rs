use axum::{
    extract::State,
    http::StatusCode,
};
use std::sync::Arc;

use crate::AppState;

pub async fn handle(
    State(_state): State<Arc<AppState>>,
) -> StatusCode {
    StatusCode::OK
}
