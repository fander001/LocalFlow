#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod catalog;
mod models;
mod server;
mod settings;

use anyhow::{Context, Result};
use tokio_util::sync::CancellationToken;

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        rfd::MessageDialog::new()
            .set_title("LocalFlow 启动失败")
            .set_description(format!("{error:#}"))
            .set_level(rfd::MessageLevel::Error)
            .show();
    }
}

async fn run() -> Result<()> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .context("无法创建本地服务")?;
    let address = listener.local_addr()?;
    let shutdown = CancellationToken::new();
    let state = server::AppState::new(settings::PersistedSettings::load(), shutdown.clone());
    let app = server::router(state);
    let url = format!("http://{address}");

    open::that(&url).context("无法打开系统浏览器")?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown.cancelled_owned())
        .await
        .context("本地服务异常退出")?;
    Ok(())
}
