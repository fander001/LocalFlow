use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct LibraryConfig {
    pub root: std::path::PathBuf,
    pub root_name: String,
    pub start_depth: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResponse {
    pub configured: bool,
    pub root_name: Option<String>,
    pub root_path: Option<String>,
    pub start_depth: usize,
    pub last_folder: String,
    pub last_start_depth: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureRequest {
    pub root_path: String,
    pub start_depth: usize,
}

#[derive(Debug, Deserialize)]
pub struct PathQuery {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderResponse {
    pub root_name: String,
    pub name: String,
    pub relative_path: String,
    pub depth: usize,
    pub start_depth: usize,
    pub mode: ViewMode,
    pub breadcrumbs: Vec<Breadcrumb>,
    pub folders: Vec<CatalogEntry>,
    pub media: Vec<CatalogEntry>,
    pub other: Vec<CatalogEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    Navigation,
    Feed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub kind: EntryKind,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified_unix_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Folder,
    Image,
    Video,
    File,
}

#[derive(Debug, Serialize)]
pub struct Breadcrumb {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickFolderResponse {
    pub selected: bool,
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ApiMessage {
    pub message: String,
}
