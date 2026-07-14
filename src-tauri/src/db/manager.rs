use chrono::Utc;
use once_cell::sync::OnceCell;
use rusqlite::{Connection, Transaction};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::db::audit_repo::{audit_storage_mutation, insert_audit, list_audit, map_storage_key_to_action, AuditEntry};
use crate::db::auth_security::{check_lockout, clear_lockout, record_failed_login, LockoutStatus};
use crate::db::backup_archive::{self, BackupWriteKey};
use crate::db::config::{
    backups_dir, database_file_path, legacy_database_file_path, APP_FOLDER,
};
use crate::db::encryption_key::{self, refresh_vault_from_plaintext, seal_database, unseal_database};
use crate::db::errors::DbError;
use crate::db::health::{ensure_healthy, run_health_check, HealthReport};
use crate::db::rbac::{authorize_read, authorize_remove, authorize_write, StorageContext};
use crate::db::schema::initialize_schema;
use crate::db::storage_repository;

static DATA_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);
static DB: OnceCell<Mutex<Option<Connection>>> = OnceCell::new();
static ENCRYPTION_KEY: Mutex<Option<Vec<u8>>> = Mutex::new(None);

fn encryption_key_bytes() -> Result<Vec<u8>, DbError> {
    ENCRYPTION_KEY
        .lock()
        .map_err(|_| DbError::Busy)?
        .clone()
        .ok_or(DbError::NotInitialized)
}

pub struct DatabaseManager;

impl DatabaseManager {
    pub fn initialize(local_data_dir: &Path, legacy_data_dir: Option<&Path>) -> Result<HealthReport, DbError> {
        {
            let mut data_dir_slot = DATA_DIR.lock().map_err(|_| DbError::Busy)?;
            if data_dir_slot.is_none() {
                let key = encryption_key::load_or_create_key(local_data_dir)
                    .map_err(|error| DbError::Internal(error))?;
                *data_dir_slot = Some(local_data_dir.to_path_buf());
                *ENCRYPTION_KEY.lock().map_err(|_| DbError::Busy)? = Some(key);
                migrate_legacy_database(local_data_dir, legacy_data_dir)?;
                unseal_database(local_data_dir, &encryption_key_bytes()?)
                    .map_err(DbError::Internal)?;
            }
        }

        let connection_open = DB
            .get()
            .and_then(|mutex| mutex.lock().ok())
            .map(|guard| guard.is_some())
            .unwrap_or(false);

        if !connection_open {
            let data_dir = Self::data_dir()?;
            open_connection(&data_dir)?;
            let _ = write_session_marker(&data_dir);
        }

        let report = Self::with_connection(|conn| {
            let data_dir = Self::data_dir()?;
            let db_path = database_file_path(&data_dir);
            let exists = db_path.exists();
            let health = ensure_healthy(conn, exists, &data_dir)?;
            create_startup_backup(conn)?;
            Ok(health)
        })?;

        Ok(report)
    }

    pub fn data_dir() -> Result<PathBuf, DbError> {
        DATA_DIR
            .lock()
            .map_err(|_| DbError::Busy)?
            .clone()
            .ok_or(DbError::NotInitialized)
    }

    pub fn database_path() -> Result<PathBuf, DbError> {
        Ok(database_file_path(&Self::data_dir()?))
    }

    pub fn with_connection<F, T>(operation: F) -> Result<T, DbError>
    where
        F: FnOnce(&Connection) -> Result<T, DbError>,
    {
        let slot = DB.get().ok_or(DbError::NotInitialized)?;
        let guard = slot.lock().map_err(|_| DbError::Busy)?;
        let conn = guard.as_ref().ok_or(DbError::NotInitialized)?;
        operation(conn)
    }

    pub fn with_transaction<F, T>(operation: F) -> Result<T, DbError>
    where
        F: FnOnce(&Transaction<'_>) -> Result<T, DbError>,
    {
        Self::with_connection(|conn| {
            let tx = conn
                .unchecked_transaction()
                .map_err(|error| DbError::Internal(error.to_string()))?;
            let result = operation(&tx)?;
            tx.commit()
                .map_err(|error| DbError::Internal(error.to_string()))?;
            Ok(result)
        })
    }

    pub fn close_connection() {
        let Some(slot) = DB.get() else {
            return;
        };
        let mut guard = slot.lock().expect("db lock");
        if let Some(conn) = guard.take() {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(FULL);");
            drop(conn);
        }
    }

    pub fn shutdown() {
        Self::close_connection();
        if let (Ok(data_dir), Ok(key)) = (Self::data_dir(), encryption_key_bytes()) {
            let _ = seal_database(&data_dir, &key);
            let _ = clear_session_marker(&data_dir);
        }
    }

    /// Checkpoint + refresh vault while keeping the DB open for this session.
    pub fn refresh_vault_keepalive() -> Result<(), DbError> {
        Self::with_connection(|conn| {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(FULL);");
            Ok(())
        })?;
        let data_dir = Self::data_dir()?;
        let key = encryption_key_bytes()?;
        refresh_vault_from_plaintext(&data_dir, &key).map_err(DbError::Internal)
    }

    /// Close and seal the DB at rest (e.g. on logout). Call `reopen` before next storage use.
    pub fn seal_at_rest() -> Result<(), DbError> {
        Self::close_connection();
        let data_dir = Self::data_dir()?;
        let key = encryption_key_bytes()?;
        seal_database(&data_dir, &key).map_err(DbError::Internal)?;
        let _ = clear_session_marker(&data_dir);
        Ok(())
    }

    pub fn reopen() -> Result<(), DbError> {
        let data_dir = Self::data_dir()?;
        unseal_database(&data_dir, &encryption_key_bytes()?)
            .map_err(DbError::Internal)?;

        let already_open = DB
            .get()
            .and_then(|mutex| mutex.lock().ok())
            .map(|guard| guard.is_some())
            .unwrap_or(false);
        if !already_open {
            open_connection(&data_dir)?;
        }
        let _ = write_session_marker(&data_dir);
        Ok(())
    }

    pub fn health_report() -> Result<HealthReport, DbError> {
        Self::with_connection(|conn| {
            let data_dir = Self::data_dir()?;
            let exists = Self::database_path()?.exists();
            Ok(run_health_check(conn, exists, &data_dir))
        })
    }

    pub fn get_storage(key: &str, ctx: &StorageContext) -> Result<Option<String>, DbError> {
        authorize_read(key, ctx)?;
        Self::with_connection(|conn| storage_repository::get(conn, key))
    }

    pub fn set_storage(key: &str, value: &str, ctx: &StorageContext) -> Result<(), DbError> {
        authorize_write(key, ctx)?;
        Self::with_transaction(|tx| {
            storage_repository::set(tx, key, value)?;
            if let Some(action) = map_storage_key_to_action(key, false) {
                audit_storage_mutation(
                    tx,
                    ctx.username(),
                    key,
                    action,
                    "success",
                );
            }
            Ok(())
        })
    }

    /// Persist multiple storage keys in a single SQLite transaction (atomic sale/stock updates).
    pub fn set_storage_many(
        entries: &[(String, String)],
        ctx: &StorageContext,
    ) -> Result<(), DbError> {
        for (key, _) in entries {
            authorize_write(key, ctx)?;
        }
        Self::with_transaction(|tx| {
            for (key, value) in entries {
                storage_repository::set(tx, key, value)?;
                if let Some(action) = map_storage_key_to_action(key, false) {
                    audit_storage_mutation(tx, ctx.username(), key, action, "success");
                }
            }
            Ok(())
        })
    }

    pub fn remove_storage(key: &str, ctx: &StorageContext) -> Result<bool, DbError> {
        authorize_remove(key, ctx)?;
        Self::with_transaction(|tx| {
            let removed = storage_repository::remove(tx, key)?;
            if removed {
                if let Some(action) = map_storage_key_to_action(key, true) {
                    audit_storage_mutation(
                        tx,
                        ctx.username(),
                        key,
                        action,
                        "success",
                    );
                }
            }
            Ok(removed)
        })
    }

    pub fn record_audit(
        username: &str,
        action: &str,
        record_affected: &str,
        status: &str,
        details: &str,
    ) -> Result<(), DbError> {
        Self::with_connection(|conn| {
            insert_audit(conn, username, action, record_affected, status, details)
                .map_err(DbError::Validation)
        })
    }

    pub fn list_audit_entries(limit: i64, offset: i64) -> Result<Vec<AuditEntry>, DbError> {
        Self::with_connection(|conn| list_audit(conn, limit, offset).map_err(DbError::Validation))
    }

    pub fn login_lockout_status(username: &str) -> Result<LockoutStatus, DbError> {
        Self::with_connection(|conn| {
            check_lockout(conn, username).map_err(DbError::Validation)
        })
    }

    pub fn record_failed_login(username: &str) -> Result<LockoutStatus, DbError> {
        Self::with_connection(|conn| {
            let status = record_failed_login(conn, username).map_err(DbError::Validation)?;
            let _ = insert_audit(
                conn,
                username,
                "login_failed",
                username,
                "failure",
                "",
            );
            Ok(status)
        })
    }

    pub fn clear_login_lockout(username: &str) -> Result<(), DbError> {
        Self::with_connection(|conn| {
            clear_lockout(conn, username).map_err(DbError::Validation)
        })
    }

    pub fn create_backup(destination: &Path, password: &str) -> Result<PathBuf, DbError> {
        let data_dir = Self::data_dir()?;
        let snapshot = create_consistent_snapshot(&data_dir)?;
        let result = backup_archive::write_backup_zip(
            &snapshot,
            destination,
            BackupWriteKey::Password(password),
        );
        let _ = fs::remove_file(&snapshot);
        result?;
        Ok(destination.to_path_buf())
    }

    pub fn backups_directory() -> Result<PathBuf, DbError> {
        Ok(backups_dir(&Self::data_dir()?))
    }

    pub fn machine_encryption_key() -> Result<Vec<u8>, DbError> {
        encryption_key_bytes()
    }

    #[cfg(test)]
    pub fn reset_state_for_tests() {
        Self::close_connection();
        if let Ok(mut guard) = DATA_DIR.lock() {
            *guard = None;
        }
        if let Ok(mut guard) = ENCRYPTION_KEY.lock() {
            *guard = None;
        }
    }
}

fn open_connection(data_dir: &Path) -> Result<(), DbError> {
    let db_path = database_file_path(data_dir);
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| DbError::Internal(error.to_string()))?;
    }

    let conn = Connection::open(&db_path).map_err(|error| DbError::Internal(error.to_string()))?;
    initialize_schema(&conn).map_err(|error| DbError::Internal(error))?;

    let slot = DB.get_or_init(|| Mutex::new(None));
    *slot.lock().map_err(|_| DbError::Busy)? = Some(conn);
    Ok(())
}

const SESSION_MARKER: &str = ".db_session";

fn session_marker_path(data_dir: &Path) -> PathBuf {
    database_file_path(data_dir)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| data_dir.to_path_buf())
        .join(SESSION_MARKER)
}

fn write_session_marker(data_dir: &Path) -> Result<(), DbError> {
    let path = session_marker_path(data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| DbError::Internal(error.to_string()))?;
    }
    fs::write(&path, b"open").map_err(|error| DbError::Internal(error.to_string()))
}

fn clear_session_marker(data_dir: &Path) -> Result<(), DbError> {
    let path = session_marker_path(data_dir);
    if path.exists() {
        fs::remove_file(&path).map_err(|error| DbError::Internal(error.to_string()))?;
    }
    Ok(())
}

fn migrate_legacy_database(local_data_dir: &Path, legacy_data_dir: Option<&Path>) -> Result<(), DbError> {
    let target = database_file_path(local_data_dir);
    if target.exists() {
        return Ok(());
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(legacy) = legacy_data_dir {
        candidates.push(legacy_database_file_path(legacy));
    }

    for source in candidates {
        if source.exists() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|error| DbError::Internal(error.to_string()))?;
            }
            fs::copy(&source, &target).map_err(|error| DbError::Internal(error.to_string()))?;
            return Ok(());
        }
    }

    Ok(())
}

fn create_startup_backup(conn: &Connection) -> Result<(), DbError> {
    let backup_root = DatabaseManager::backups_directory()?;
    fs::create_dir_all(&backup_root).map_err(|error| DbError::Internal(error.to_string()))?;

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let destination = backup_root.join(format!("invora_backup_{timestamp}.zip"));

    let snapshot = create_snapshot_from_connection(conn, &DatabaseManager::data_dir()?)?;
    let machine_key = encryption_key_bytes()?;
    let backup_result = backup_archive::write_backup_zip(
        &snapshot,
        &destination,
        BackupWriteKey::Machine(&machine_key),
    );
    let _ = fs::remove_file(&snapshot);
    backup_result?;

    prune_old_backups(&backup_root, 10)?;
    Ok(())
}

fn prune_old_backups(backup_root: &Path, keep: usize) -> Result<(), DbError> {
    let mut files: Vec<PathBuf> = fs::read_dir(backup_root)
        .map_err(|error| DbError::Internal(error.to_string()))?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("zip"))
        .collect();

    files.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|meta| meta.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
    });

    while files.len() > keep {
        if let Some(oldest) = files.first() {
            let _ = fs::remove_file(oldest);
            files.remove(0);
        } else {
            break;
        }
    }

    Ok(())
}

fn temp_snapshot_path(data_dir: &Path) -> PathBuf {
    data_dir.join(APP_FOLDER).join("invora.export.tmp.db")
}

fn create_consistent_snapshot(data_dir: &Path) -> Result<PathBuf, DbError> {
    DatabaseManager::with_connection(|source| create_snapshot_from_connection(source, data_dir))
}

fn create_snapshot_from_connection(source: &Connection, data_dir: &Path) -> Result<PathBuf, DbError> {
    let snapshot_path = temp_snapshot_path(data_dir);
    if let Some(parent) = snapshot_path.parent() {
        fs::create_dir_all(parent).map_err(|error| DbError::Internal(error.to_string()))?;
    }
    if snapshot_path.exists() {
        fs::remove_file(&snapshot_path).map_err(|error| DbError::Internal(error.to_string()))?;
    }

    let mut dest = Connection::open(&snapshot_path)
        .map_err(|error| DbError::Internal(error.to_string()))?;
    let backup = rusqlite::backup::Backup::new(source, &mut dest)
        .map_err(|error| DbError::Internal(error.to_string()))?;
    backup
        .run_to_completion(100, std::time::Duration::from_millis(10), None)
        .map_err(|error| DbError::Internal(error.to_string()))?;

    Ok(snapshot_path)
}

// Legacy compatibility helpers used by license module and internal callers.
pub fn get_storage_item(key: &str) -> Option<String> {
    DatabaseManager::get_storage(key, &StorageContext::default())
        .ok()
        .flatten()
}

pub fn set_storage_item(key: &str, value: &str) {
    let _ = DatabaseManager::set_storage(key, value, &StorageContext::default());
}

pub fn init_database(local_data_dir: &Path, legacy_data_dir: Option<&Path>) {
    match DatabaseManager::initialize(local_data_dir, legacy_data_dir) {
        Ok(report) => {
            if !report.healthy {
                eprintln!("database health warning: {:?}", report.message);
            }
        }
        Err(error) => {
            eprintln!("database initialization failed: {}", error.log_detail());
        }
    }
}

pub fn shutdown_database() {
    DatabaseManager::shutdown();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::rbac::AppRole;
    use serial_test::serial;
    use std::env::temp_dir;

    fn temp_data_dir(name: &str) -> PathBuf {
        DatabaseManager::reset_state_for_tests();
        let path = temp_dir().join(format!("invora_test_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        path
    }

    #[test]
    #[serial]
    fn transaction_rolls_back_on_failure() {
        let data_dir = temp_data_dir("rollback");
        DatabaseManager::initialize(&data_dir, None).expect("init");

        let ctx = StorageContext {
            username: Some("admin".to_string()),
            role: Some(AppRole::Admin.as_str().to_string()),
        };

        DatabaseManager::set_storage("mentx_products", r#"["p1"]"#, &ctx).expect("set");
        let failed: Result<(), DbError> = DatabaseManager::with_transaction(|tx| {
            storage_repository::set(tx, "mentx_products", r#"["p2"]"#)?;
            Err(DbError::Validation("forced failure".to_string()))
        });
        assert!(failed.is_err());

        let value = DatabaseManager::get_storage("mentx_products", &ctx)
            .expect("get")
            .expect("value");
        assert_eq!(value, r#"["p1"]"#);

        DatabaseManager::shutdown();
        let _ = fs::remove_dir_all(data_dir);
    }
}
