use std::{
    io::SeekFrom,
    path::PathBuf,
    sync::Arc,
};

use axum::{
    Json, Router,
    body::Body,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use rust_embed::RustEmbed;
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt},
    sync::RwLock,
};
use tokio_util::{io::ReaderStream, sync::CancellationToken};

use crate::{
    catalog,
    models::{
        ApiMessage, ConfigureRequest, FolderResponse, LibraryConfig, PathQuery,
        PickFolderResponse, StatusResponse,
    },
    settings::PersistedSettings,
};

#[derive(Clone)]
pub struct AppState {
    config: Arc<RwLock<Option<LibraryConfig>>>,
    settings: Arc<RwLock<PersistedSettings>>,
    shutdown: CancellationToken,
}

impl AppState {
    pub fn new(settings: PersistedSettings, shutdown: CancellationToken) -> Self {
        Self {
            config: Arc::new(RwLock::new(None)),
            settings: Arc::new(RwLock::new(settings)),
            shutdown,
        }
    }
}

#[derive(RustEmbed)]
#[folder = "frontend/dist/"]
struct Frontend;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/status", get(status))
        .route("/api/pick-folder", post(pick_folder))
        .route("/api/configure", post(configure))
        .route("/api/folder", get(folder))
        .route("/api/cover", get(cover))
        .route("/media", get(media))
        .route("/api/exit", post(exit_app))
        .fallback(frontend)
        .with_state(state)
}

async fn status(State(state): State<AppState>) -> Json<StatusResponse> {
    let config = state.config.read().await.clone();
    let settings = state.settings.read().await.clone();
    Json(StatusResponse {
        configured: config.is_some(),
        root_name: config.as_ref().map(|value| value.root_name.clone()),
        root_path: config.as_ref().map(|value| value.root.display().to_string()),
        start_depth: config.as_ref().map(|value| value.start_depth).unwrap_or(settings.last_start_depth),
        last_folder: settings.last_folder,
        last_start_depth: settings.last_start_depth,
    })
}

async fn pick_folder() -> Json<PickFolderResponse> {
    let selected = tokio::task::spawn_blocking(|| rfd::FileDialog::new().set_title("选择 LocalFlow 媒体目录").pick_folder())
        .await
        .ok()
        .flatten();

    Json(PickFolderResponse {
        selected: selected.is_some(),
        path: selected.map(|value| value.display().to_string()),
    })
}

async fn configure(
    State(state): State<AppState>,
    Json(request): Json<ConfigureRequest>,
) -> ApiResult<Json<ApiMessage>> {
    let config = catalog::make_config(&request.root_path, request.start_depth)
        .map_err(ApiError::bad_request)?;

    {
        let mut settings = state.settings.write().await;
        settings.last_folder = config.root.display().to_string();
        settings.last_start_depth = config.start_depth;
        settings.save();
    }

    *state.config.write().await = Some(config);
    Ok(Json(ApiMessage { message: "媒体库已打开".into() }))
}

async fn folder(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
) -> ApiResult<Json<FolderResponse>> {
    let config = require_config(&state).await?;
    let data = tokio::task::spawn_blocking(move || catalog::read_folder(&config, &query.path))
        .await
        .map_err(ApiError::internal)?
        .map_err(ApiError::bad_request)?;
    Ok(Json(data))
}

async fn media(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let config = require_config(&state).await?;
    let path = tokio::task::spawn_blocking(move || catalog::resolve_file(&config, &query.path))
        .await
        .map_err(ApiError::internal)?
        .map_err(ApiError::bad_request)?;
    serve_path(path, headers.get(header::RANGE)).await
}

async fn cover(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
) -> ApiResult<Response> {
    let config = require_config(&state).await?;
    let path = tokio::task::spawn_blocking(move || catalog::find_cover(&config, &query.path))
        .await
        .map_err(ApiError::internal)?
        .map_err(ApiError::bad_request)?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "该目录没有可用封面"))?;
    serve_path(path, None).await
}

async fn exit_app(State(state): State<AppState>) -> Json<ApiMessage> {
    state.shutdown.cancel();
    Json(ApiMessage { message: "LocalFlow 已退出".into() })
}

async fn require_config(state: &AppState) -> ApiResult<LibraryConfig> {
    state
        .config
        .read()
        .await
        .clone()
        .ok_or_else(|| ApiError::new(StatusCode::PRECONDITION_REQUIRED, "请先选择媒体目录"))
}

async fn serve_path(path: PathBuf, range_header: Option<&HeaderValue>) -> ApiResult<Response> {
    let mut file = File::open(&path).await.map_err(ApiError::not_found)?;
    let total = file.metadata().await.map_err(ApiError::not_found)?.len();
    let (start, end, status) = match range_header.and_then(|value| value.to_str().ok()) {
        Some(value) => parse_range(value, total)?,
        None => (0, total.saturating_sub(1), StatusCode::OK),
    };
    let length = if total == 0 { 0 } else { end - start + 1 };

    file.seek(SeekFrom::Start(start)).await.map_err(ApiError::internal)?;
    let stream = ReaderStream::new(file.take(length));
    let mut response = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime_guess::from_path(&path).first_or_octet_stream().as_ref())
        .header(header::CONTENT_LENGTH, length)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .body(Body::from_stream(stream))
        .map_err(ApiError::internal)?;

    if status == StatusCode::PARTIAL_CONTENT {
        response.headers_mut().insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {start}-{end}/{total}")).map_err(ApiError::internal)?,
        );
    }
    Ok(response)
}

fn parse_range(value: &str, total: u64) -> ApiResult<(u64, u64, StatusCode)> {
    if total == 0 || !value.starts_with("bytes=") || value.contains(',') {
        return Err(ApiError::range(total));
    }

    let value = &value[6..];
    let (start_text, end_text) = value.split_once('-').ok_or_else(|| ApiError::range(total))?;
    let (start, end) = if start_text.is_empty() {
        let suffix = end_text.parse::<u64>().map_err(|_| ApiError::range(total))?;
        if suffix == 0 { return Err(ApiError::range(total)); }
        (total.saturating_sub(suffix), total - 1)
    } else {
        let start = start_text.parse::<u64>().map_err(|_| ApiError::range(total))?;
        let end = if end_text.is_empty() {
            total - 1
        } else {
            end_text.parse::<u64>().map_err(|_| ApiError::range(total))?.min(total - 1)
        };
        (start, end)
    };

    if start >= total || start > end {
        return Err(ApiError::range(total));
    }
    Ok((start, end, StatusCode::PARTIAL_CONTENT))
}

async fn frontend(uri: axum::http::Uri) -> Response {
    let requested = uri.path().trim_start_matches('/');
    let path = if requested.is_empty() { "index.html" } else { requested };
    let asset = Frontend::get(path).or_else(|| Frontend::get("index.html"));

    match asset {
        Some(asset) => {
            let content_type = mime_guess::from_path(path).first_or_octet_stream();
            (
                [
                    (header::CONTENT_TYPE, content_type.as_ref()),
                    (header::CACHE_CONTROL, if path == "index.html" { "no-cache" } else { "public, max-age=31536000, immutable" }),
                    (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
                ],
                asset.data,
            ).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

type ApiResult<T> = Result<T, ApiError>;

struct ApiError {
    status: StatusCode,
    message: String,
    content_range: Option<String>,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self { status, message: message.into(), content_range: None }
    }

    fn bad_request(error: impl std::fmt::Display) -> Self {
        Self::new(StatusCode::BAD_REQUEST, error.to_string())
    }

    fn not_found(error: impl std::fmt::Display) -> Self {
        Self::new(StatusCode::NOT_FOUND, error.to_string())
    }

    fn internal(error: impl std::fmt::Display) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    }

    fn range(total: u64) -> Self {
        Self {
            status: StatusCode::RANGE_NOT_SATISFIABLE,
            message: "请求的媒体范围无效".into(),
            content_range: Some(format!("bytes */{total}")),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut response = (self.status, Json(ApiMessage { message: self.message })).into_response();
        if let Some(value) = self.content_range.and_then(|value| HeaderValue::from_str(&value).ok()) {
            response.headers_mut().insert(header::CONTENT_RANGE, value);
        }
        response
    }
}
