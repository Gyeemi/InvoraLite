use std::path::{Path, PathBuf};

pub const APP_FOLDER: &str = "InvoraLite";
pub const DB_FILE_NAME: &str = "invora.db";
pub const VAULT_FILE_NAME: &str = "invora.db.vault";
pub const MAX_VALUE_BYTES: usize = 50 * 1024 * 1024;

pub fn database_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join(APP_FOLDER).join(DB_FILE_NAME)
}

pub fn vault_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join(APP_FOLDER).join(VAULT_FILE_NAME)
}

pub fn backups_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(APP_FOLDER).join("backups")
}

pub fn legacy_database_file_path(legacy_data_dir: &Path) -> PathBuf {
    legacy_data_dir.join("Invora").join(DB_FILE_NAME)
}
