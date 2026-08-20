use std::{
    fs::{self, DirEntry},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use anyhow::{Context, Result, bail};

use crate::models::{
    Breadcrumb, CatalogEntry, EntryKind, FolderResponse, LibraryConfig, ViewMode,
};

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "m4v", "webm", "mov", "ogv", "mkv", "avi", "wmv"];

pub fn make_config(root: &str, start_depth: usize) -> Result<LibraryConfig> {
    let root = fs::canonicalize(root).context("无法读取所选目录")?;
    if !root.is_dir() {
        bail!("所选路径不是文件夹");
    }

    let root_name = root
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| root.display().to_string());

    Ok(LibraryConfig {
        root,
        root_name,
        start_depth: start_depth.clamp(1, 30),
    })
}

pub fn read_folder(config: &LibraryConfig, relative_path: &str) -> Result<FolderResponse> {
    let directory = resolve_directory(config, relative_path)?;
    let relative_path = to_relative(&config.root, &directory);
    let depth = if relative_path.is_empty() {
        1
    } else {
        relative_path.split('/').count() + 1
    };

    let mut entries = fs::read_dir(&directory)
        .with_context(|| format!("无法读取目录：{}", directory.display()))?
        .filter_map(Result::ok)
        .filter(|entry| !is_link(entry))
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| natord::compare(&left.file_name().to_string_lossy(), &right.file_name().to_string_lossy()));

    let mut folders = Vec::new();
    let mut media = Vec::new();
    let mut other = Vec::new();

    for entry in entries {
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            folders.push(to_entry(config, &entry, EntryKind::Folder));
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let extension = entry
            .path()
            .extension()
            .map(|value| value.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();

        if IMAGE_EXTENSIONS.contains(&extension.as_str()) {
            media.push(to_entry(config, &entry, EntryKind::Image));
        } else if VIDEO_EXTENSIONS.contains(&extension.as_str()) {
            media.push(to_entry(config, &entry, EntryKind::Video));
        } else {
            other.push(to_entry(config, &entry, EntryKind::File));
        }
    }

    let mode = if depth >= config.start_depth || folders.is_empty() {
        ViewMode::Feed
    } else {
        ViewMode::Navigation
    };

    let name = directory
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| config.root_name.clone());

    Ok(FolderResponse {
        root_name: config.root_name.clone(),
        name,
        relative_path: relative_path.clone(),
        depth,
        start_depth: config.start_depth,
        mode,
        breadcrumbs: breadcrumbs(config, &relative_path),
        folders,
        media,
        other,
    })
}

pub fn resolve_file(config: &LibraryConfig, relative_path: &str) -> Result<PathBuf> {
    let path = resolve(config, relative_path)?;
    if !path.is_file() {
        bail!("文件不存在");
    }
    Ok(path)
}

pub fn find_cover(config: &LibraryConfig, relative_path: &str) -> Result<Option<PathBuf>> {
    let directory = resolve_directory(config, relative_path)?;
    let mut images = fs::read_dir(directory)?
        .filter_map(Result::ok)
        .filter(|entry| !is_link(entry))
        .filter(|entry| entry.file_type().map(|kind| kind.is_file()).unwrap_or(false))
        .filter(|entry| {
            entry
                .path()
                .extension()
                .map(|value| IMAGE_EXTENSIONS.contains(&value.to_string_lossy().to_ascii_lowercase().as_str()))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    images.sort_by(|left, right| natord::compare(&left.file_name().to_string_lossy(), &right.file_name().to_string_lossy()));
    Ok(images.first().map(DirEntry::path))
}

fn resolve_directory(config: &LibraryConfig, relative_path: &str) -> Result<PathBuf> {
    let path = resolve(config, relative_path)?;
    if !path.is_dir() {
        bail!("目录不存在");
    }
    Ok(path)
}

fn resolve(config: &LibraryConfig, relative_path: &str) -> Result<PathBuf> {
    let candidate = config.root.join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    let canonical = fs::canonicalize(&candidate)
        .with_context(|| format!("路径不存在：{}", candidate.display()))?;

    if canonical != config.root && !canonical.starts_with(&config.root) {
        bail!("请求超出已选择的根目录");
    }

    Ok(canonical)
}

fn to_entry(config: &LibraryConfig, entry: &DirEntry, kind: EntryKind) -> CatalogEntry {
    let metadata = entry.metadata().ok();
    CatalogEntry {
        kind,
        name: entry.file_name().to_string_lossy().into_owned(),
        path: to_relative(&config.root, &entry.path()),
        size: metadata.as_ref().map(|value| value.len()).unwrap_or(0),
        modified_unix_ms: metadata
            .and_then(|value| value.modified().ok())
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_millis())
            .unwrap_or(0),
    }
}

fn to_relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string()
}

fn breadcrumbs(config: &LibraryConfig, relative_path: &str) -> Vec<Breadcrumb> {
    let mut result = vec![Breadcrumb {
        name: config.root_name.clone(),
        path: String::new(),
    }];
    let mut current = String::new();

    for segment in relative_path.split('/').filter(|segment| !segment.is_empty()) {
        if !current.is_empty() {
            current.push('/');
        }
        current.push_str(segment);
        result.push(Breadcrumb {
            name: segment.to_string(),
            path: current.clone(),
        });
    }

    result
}

fn is_link(entry: &DirEntry) -> bool {
    entry.file_type().map(|kind| kind.is_symlink()).unwrap_or(true)
}
