mod backup;
mod database;
mod db;
mod device;
mod license;
mod password;

use backup::{export_database, inspect_backup, restore_database};
use database::init_database;
use db::auth_security::LockoutStatus;
use db::audit_repo::AuditEntry;
use db::errors::StorageResult;
use db::health::HealthReport;
use db::manager::DatabaseManager;
use db::rbac::{AppRole, StorageContext};
use license::{activate_license, activate_license_from_zip_base64, get_license_status, start_trial};
use password::{hash_password, verify_password_with_migration, PasswordVerifyResult};
use std::path::PathBuf;
use tauri::{Manager, RunEvent};

#[tauri::command]
fn storage_get(key: String, context: Option<StorageContext>) -> Option<String> {
    let ctx = context.unwrap_or_default();
    DatabaseManager::get_storage(&key, &ctx).ok().flatten()
}

#[tauri::command]
fn storage_set(key: String, value: String, context: Option<StorageContext>) -> StorageResult {
    let ctx = context.unwrap_or_default();
    match DatabaseManager::set_storage(&key, &value, &ctx) {
        Ok(()) => StorageResult::ok(),
        Err(error) => StorageResult::err(error),
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageEntry {
    key: String,
    value: String,
}

#[tauri::command]
fn storage_set_many(entries: Vec<StorageEntry>, context: Option<StorageContext>) -> StorageResult {
    let ctx = context.unwrap_or_default();
    let pairs: Vec<(String, String)> = entries
        .into_iter()
        .map(|entry| (entry.key, entry.value))
        .collect();
    match DatabaseManager::set_storage_many(&pairs, &ctx) {
        Ok(()) => StorageResult::ok(),
        Err(error) => StorageResult::err(error),
    }
}

#[tauri::command]
fn storage_remove(key: String, context: Option<StorageContext>) -> StorageResult {
    let ctx = context.unwrap_or_default();
    match DatabaseManager::remove_storage(&key, &ctx) {
        Ok(_) => StorageResult::ok(),
        Err(error) => StorageResult::err(error),
    }
}

#[tauri::command]
fn database_health() -> Result<HealthReport, String> {
    DatabaseManager::health_report().map_err(|error| error.user_message().to_string())
}

/// Close and seal the live DB after logout / idle lock. Call `database_ensure_open` before next use.
#[tauri::command]
fn database_seal_at_rest() -> Result<(), String> {
    DatabaseManager::seal_at_rest().map_err(|error| error.user_message().to_string())
}

/// Unseal (if needed) and reopen the connection after `database_seal_at_rest`.
#[tauri::command]
fn database_ensure_open() -> Result<(), String> {
    DatabaseManager::reopen().map_err(|error| error.user_message().to_string())
}

/// Checkpoint WAL and refresh the encrypted vault while keeping the DB open.
#[tauri::command]
fn database_refresh_vault() -> Result<(), String> {
    DatabaseManager::refresh_vault_keepalive().map_err(|error| error.user_message().to_string())
}

#[tauri::command]
fn audit_record(
    username: String,
    action: String,
    record_affected: String,
    status: String,
    details: Option<String>,
) -> StorageResult {
    match DatabaseManager::record_audit(
        &username,
        &action,
        &record_affected,
        &status,
        details.as_deref().unwrap_or(""),
    ) {
        Ok(()) => StorageResult::ok(),
        Err(error) => StorageResult::err(error),
    }
}

#[tauri::command]
fn audit_list(
    limit: Option<i64>,
    offset: Option<i64>,
    context: Option<StorageContext>,
) -> Result<Vec<AuditEntry>, String> {
    let ctx = context.unwrap_or_default();
    if ctx.role() != Some(AppRole::Admin) && ctx.role() != Some(AppRole::Manager) {
        return Err("Only administrators and managers can view the audit log.".to_string());
    }
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let offset = offset.unwrap_or(0).max(0);
    DatabaseManager::list_audit_entries(limit, offset)
        .map_err(|error| error.user_message().to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn auth_lockout_status(username: String) -> Result<LockoutStatus, String> {
    DatabaseManager::login_lockout_status(&username).map_err(|error| error.user_message().to_string())
}

#[tauri::command]
fn auth_record_failed_login(username: String) -> Result<LockoutStatus, String> {
    DatabaseManager::record_failed_login(&username)
        .map_err(|error| error.user_message().to_string())
}

#[tauri::command]
fn auth_clear_lockout(username: String) -> StorageResult {
    match DatabaseManager::clear_login_lockout(&username) {
        Ok(()) => StorageResult::ok(),
        Err(error) => StorageResult::err(error),
    }
}

#[tauri::command]
fn license_status() -> license::LicenseStatus {
    get_license_status()
}

#[tauri::command]
fn license_activate(license_key: String) -> license::ActivateResult {
    activate_license(&license_key)
}

#[tauri::command]
fn license_activate_from_zip(zip_base64: String) -> license::ActivateResult {
    activate_license_from_zip_base64(&zip_base64)
}

#[tauri::command]
fn license_start_trial() -> license::TrialResult {
    start_trial()
}

#[tauri::command]
fn license_device_id() -> String {
    device::get_device_id()
}

#[tauri::command]
fn database_export(destination: String, password: String) -> backup::ExportDatabaseResult {
    export_database(PathBuf::from(destination).as_path(), &password)
}

#[tauri::command]
fn database_inspect_backup(source: String) -> backup::InspectBackupResult {
    inspect_backup(PathBuf::from(source).as_path())
}

#[tauri::command]
fn database_restore(
    app: tauri::AppHandle,
    source: String,
    backup_password: Option<String>,
) -> backup::RestoreDatabaseResult {
    let result = restore_database(
        PathBuf::from(source).as_path(),
        backup_password.as_deref(),
    );
    if result.success {
        app.restart();
    }
    result
}

#[tauri::command]
fn password_hash(password: String) -> Result<String, String> {
    hash_password(&password)
}

#[tauri::command]
fn password_verify(password: String, stored: String) -> PasswordVerifyResult {
    verify_password_with_migration(&password, &stored)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let local_data_dir = app.path().app_local_data_dir().expect("app local data dir");
            let legacy_data_dir = app.path().app_data_dir().ok();
            init_database(&local_data_dir, legacy_data_dir.as_deref());
            license::migrate_trial_to_60_days();
            if let Some(window) = app.get_webview_window("main") {
                let title = format!("InvoraLite {}", env!("CARGO_PKG_VERSION"));
                let _ = window.set_title(&title);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage_get,
            storage_set,
            storage_set_many,
            storage_remove,
            database_health,
            database_seal_at_rest,
            database_ensure_open,
            database_refresh_vault,
            audit_record,
            audit_list,
            read_text_file,
            write_text_file,
            auth_lockout_status,
            auth_record_failed_login,
            auth_clear_lockout,
            license_status,
            license_activate,
            license_activate_from_zip,
            license_start_trial,
            license_device_id,
            database_export,
            database_inspect_backup,
            database_restore,
            password_hash,
            password_verify,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, event| {
            if matches!(event, RunEvent::Exit) {
                database::shutdown_database();
            }
        });
}
