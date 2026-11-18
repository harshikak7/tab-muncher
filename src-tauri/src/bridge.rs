//! Local WebSocket server the Chrome extension streams tab events to.
//!
//! - Binds to 127.0.0.1 only (never reachable from the network).
//! - Accepts only handshakes whose `Origin` is a Chrome extension, so ordinary web pages
//!   open in the browser can't connect and spoof events.
//! - Every JSON message with a string `type` is forwarded to the frontend as `tab-event`.
//!   The latest snapshot is cached so a freshly loaded frontend can catch up (`bridge_state`).

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::Message;

/// Must match `PORT` in chrome-extension/background.js.
pub const PORT: u16 = 17345;
const MAX_MESSAGE: usize = 512 * 1024;

#[derive(Default)]
pub struct BridgeState {
    listening: AtomicBool,
    clients: AtomicUsize,
    error: Mutex<Option<String>>,
    last_snapshot: Mutex<Option<Value>>,
}

impl BridgeState {
    fn status(&self) -> Value {
        json!({
            "listening": self.listening.load(Ordering::SeqCst),
            "clients": self.clients.load(Ordering::SeqCst),
            "port": PORT,
            "error": self.error.lock().ok().and_then(|e| e.clone()),
        })
    }
}

#[tauri::command]
pub fn bridge_state(state: State<'_, BridgeState>) -> Value {
    json!({
        "status": state.status(),
        "snapshot": state.last_snapshot.lock().ok().and_then(|s| s.clone()),
    })
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = serve(app.clone()).await {
            eprintln!("[tab-muncher] websocket server stopped: {e}");
            let state = app.state::<BridgeState>();
            state.listening.store(false, Ordering::SeqCst);
            if let Ok(mut err) = state.error.lock() {
                *err = Some(format!("could not listen on 127.0.0.1:{PORT}: {e}"));
            }
            let _ = app.emit("bridge-status", state.status());
        }
    });
}

async fn serve(app: AppHandle) -> std::io::Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", PORT)).await?;
    app.state::<BridgeState>().listening.store(true, Ordering::SeqCst);
    println!("[tab-muncher] waiting for the Chrome extension on ws://127.0.0.1:{PORT}");
    let app = Arc::new(app);
    loop {
        let (stream, _) = listener.accept().await?;
        let app = app.clone();
        tauri::async_runtime::spawn(async move { handle(&app, stream).await });
    }
}

#[allow(clippy::result_large_err)] // signature dictated by tungstenite's handshake callback
fn check_origin(req: &Request, resp: Response) -> Result<Response, ErrorResponse> {
    let from_extension = req
        .headers()
        .get("origin")
        .and_then(|o| o.to_str().ok())
        .is_some_and(|o| o.starts_with("chrome-extension://"));
    if from_extension {
        Ok(resp)
    } else {
        let mut deny = ErrorResponse::new(Some("only the Tab Muncher extension may connect".into()));
        *deny.status_mut() = StatusCode::FORBIDDEN;
        Err(deny)
    }
}

async fn handle(app: &AppHandle, stream: TcpStream) {
    let config = WebSocketConfig::default()
        .max_message_size(Some(MAX_MESSAGE))
        .max_frame_size(Some(MAX_MESSAGE));
    let Ok(ws) = tokio_tungstenite::accept_hdr_async_with_config(stream, check_origin, Some(config)).await else {
        return;
    };
    let state = app.state::<BridgeState>();
    state.clients.fetch_add(1, Ordering::SeqCst);
    let _ = app.emit("bridge-status", state.status());

    let (mut tx, mut rx) = ws.split();
    while let Some(Ok(msg)) = rx.next().await {
        let Message::Text(text) = msg else { continue };
        let Ok(value) = serde_json::from_str::<Value>(text.as_str()) else { continue };
        let Some(kind) = value.get("type").and_then(Value::as_str) else { continue };
        match kind {
            "ping" => {
                let _ = tx.send(Message::text(r#"{"type":"pong"}"#)).await;
            }
            _ => {
                if kind == "snapshot" {
                    if let Ok(mut s) = state.last_snapshot.lock() {
                        *s = Some(value.clone());
                    }
                }
                let _ = app.emit("tab-event", value);
            }
        }
    }

    state.clients.fetch_sub(1, Ordering::SeqCst);
    if state.clients.load(Ordering::SeqCst) == 0 {
        if let Ok(mut s) = state.last_snapshot.lock() {
            *s = None;
        }
    }
    let _ = app.emit("bridge-status", state.status());
}
