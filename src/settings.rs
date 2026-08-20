use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSettings {
    pub last_folder: String,
    pub last_start_depth: usize,
}

impl Default for PersistedSettings {
    fn default() -> Self {
        Self {
            last_folder: String::new(),
            last_start_depth: 3,
        }
    }
}

impl PersistedSettings {
    pub fn load() -> Self {
        fs::read_to_string(settings_path())
            .ok()
            .and_then(|value| serde_json::from_str(&value).ok())
            .unwrap_or_default()
    }

    pub fn save(&self) {
        let path = settings_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(value) = serde_json::to_string_pretty(self) {
            let _ = fs::write(path, value);
        }
    }
}

fn settings_path() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("LocalFlow").join("settings.json")
}
