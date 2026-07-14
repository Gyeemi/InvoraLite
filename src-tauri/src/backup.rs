use serde::Serialize;
use std::fs::{self, File};
use std::path::Path;

use crate::db::backup_archive::{self, BackupInspection, BackupReadKey};
use crate::db::manager::DatabaseManager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDatabaseResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreDatabaseResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_backup_password: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectBackupResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inspection: Option<BackupInspection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn export_database(destination: &Path, password: &str) -> ExportDatabaseResult {
    match DatabaseManager::create_backup(destination, password) {
        Ok(path) => ExportDatabaseResult {
            success: true,
            path: Some(path.to_string_lossy().to_string()),
            error: None,
        },
        Err(error) => ExportDatabaseResult {
            success: false,
            path: None,
            error: Some(error.user_message().to_string()),
        },
    }
}

pub fn inspect_backup(source: &Path) -> InspectBackupResult {
    match backup_archive::inspect_backup(source) {
        Ok(inspection) => InspectBackupResult {
            success: true,
            inspection: Some(inspection),
            error: None,
        },
        Err(error) => InspectBackupResult {
            success: false,
            inspection: None,
            error: Some(error),
        },
    }
}

pub fn restore_database(source: &Path, backup_password: Option<&str>) -> RestoreDatabaseResult {
    match extract_database_from_zip(source, backup_password) {
        Ok(()) => RestoreDatabaseResult {
            success: true,
            error: None,
            requires_backup_password: None,
        },
        Err(error) if error == "BACKUP_PASSWORD_REQUIRED" => RestoreDatabaseResult {
            success: false,
            error: Some(
                "This backup is password-protected. Enter the backup password used during export."
                    .to_string(),
            ),
            requires_backup_password: Some(true),
        },
        Err(error) => RestoreDatabaseResult {
            success: false,
            error: Some(error),
            requires_backup_password: None,
        },
    }
}

fn extract_database_from_zip(source: &Path, backup_password: Option<&str>) -> Result<(), String> {
    let inspection = backup_archive::inspect_backup(source)?;
    let db_bytes = if inspection.requires_password {
        let password = backup_password
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "BACKUP_PASSWORD_REQUIRED".to_string())?;
        backup_archive::extract_backup_database(source, Some(BackupReadKey::Password(password)))?
    } else if inspection.encrypted {
        let machine_key = DatabaseManager::machine_encryption_key()
            .map_err(|error| error.user_message().to_string())?;
        backup_archive::extract_backup_database(source, Some(BackupReadKey::Machine(&machine_key)))?
    } else {
        backup_archive::extract_backup_database(source, None)?
    };

    install_restored_database(db_bytes)
}

fn install_restored_database(db_bytes: Vec<u8>) -> Result<(), String> {
    let restore_path = DatabaseManager::database_path()
        .map_err(|error| error.user_message().to_string())?;
    let db_dir = restore_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Could not resolve database folder.".to_string())?;
    fs::create_dir_all(&db_dir).map_err(|error| format!("Could not prepare database folder: {error}"))?;

    let temp_restore_path = db_dir.join("invora.restore.tmp.db");
    if temp_restore_path.exists() {
        fs::remove_file(&temp_restore_path)
            .map_err(|error| format!("Could not clear temporary restore file: {error}"))?;
    }

    {
        let mut temp_file = File::create(&temp_restore_path)
            .map_err(|error| format!("Could not prepare restored database: {error}"))?;
        use std::io::Write;
        temp_file
            .write_all(&db_bytes)
            .map_err(|error| format!("Could not write restored database: {error}"))?;
    }

    let wal_path = restore_path.with_extension("db-wal");
    let shm_path = restore_path.with_extension("db-shm");
    let backup_path = db_dir.join("invora.db.bak");

    DatabaseManager::close_connection();

    let restore_result = (|| -> Result<(), String> {
        if restore_path.exists() {
            fs::rename(&restore_path, &backup_path)
                .map_err(|error| format!("Could not back up current database: {error}"))?;
        }
        for path in [&wal_path, &shm_path] {
            if path.exists() {
                fs::remove_file(path).map_err(|error| format!("Could not clear database journal: {error}"))?;
            }
        }
        fs::rename(&temp_restore_path, &restore_path)
            .map_err(|error| format!("Could not install restored database: {error}"))?;
        if backup_path.exists() {
            fs::remove_file(&backup_path).ok();
        }
        Ok(())
    })();

    if restore_result.is_err() {
        if backup_path.exists() && !restore_path.exists() {
            let _ = fs::rename(&backup_path, &restore_path);
        }
        if temp_restore_path.exists() {
            let _ = fs::remove_file(&temp_restore_path);
        }
    }

    DatabaseManager::reopen()
        .map_err(|error| error.user_message().to_string())?;
    restore_result
}
