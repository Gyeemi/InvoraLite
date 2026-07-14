use std::fs;
use std::path::PathBuf;

use rusqlite::Connection;
use serial_test::serial;

use crate::db::auth_security::{check_lockout, record_failed_login, MAX_FAILED_ATTEMPTS};
use crate::db::errors::DbError;
use crate::db::manager::DatabaseManager;
use crate::db::rbac::{authorize_write, AppRole, StorageContext};
use crate::db::schema::initialize_schema;

fn temp_data_dir(name: &str) -> PathBuf {
    DatabaseManager::reset_state_for_tests();
    let path = std::env::temp_dir().join(format!("invora_int_{name}_{}", std::process::id()));
    let _ = fs::remove_dir_all(&path);
    path
}

fn admin_context() -> StorageContext {
    StorageContext {
        username: Some("admin".to_string()),
        role: Some(AppRole::Admin.as_str().to_string()),
    }
}

#[test]
#[serial]
fn rejects_sql_injection_in_storage_key() {
    let data_dir = temp_data_dir("sqli");
    DatabaseManager::initialize(&data_dir, None).expect("init");
    let ctx = admin_context();

    let result = DatabaseManager::set_storage(
        "mentx_products'; DROP TABLE app_storage; --",
        "[]",
        &ctx,
    );
    assert!(matches!(result, Err(DbError::Validation(_))));

    DatabaseManager::shutdown();
    let _ = fs::remove_dir_all(data_dir);
}

#[test]
#[serial]
fn viewer_cannot_write_inventory() {
    let data_dir = temp_data_dir("viewer");
    DatabaseManager::initialize(&data_dir, None).expect("init");

    let ctx = StorageContext {
        username: Some("viewer".to_string()),
        role: Some("Viewer".to_string()),
    };
    let result = DatabaseManager::set_storage("mentx_products", "[]", &ctx);
    assert!(matches!(result, Err(DbError::Authorization(_))));

    DatabaseManager::shutdown();
    let _ = fs::remove_dir_all(data_dir);
}

#[test]
#[serial]
fn cashier_cannot_write_products() {
    let data_dir = temp_data_dir("cashier");
    DatabaseManager::initialize(&data_dir, None).expect("init");

    let ctx = StorageContext {
        username: Some("cashier".to_string()),
        role: Some("Cashier".to_string()),
    };
    assert!(authorize_write("mentx_products", &ctx).is_err());
    assert!(authorize_write("mentx_sales", &ctx).is_ok());

    DatabaseManager::shutdown();
    let _ = fs::remove_dir_all(data_dir);
}

#[test]
#[serial]
fn duplicate_storage_key_upserts_value() {
    let data_dir = temp_data_dir("duplicate");
    DatabaseManager::initialize(&data_dir, None).expect("init");
    let ctx = admin_context();

    DatabaseManager::set_storage("mentx_products", r#"["a"]"#, &ctx).expect("first set");
    DatabaseManager::set_storage("mentx_products", r#"["a","b"]"#, &ctx).expect("second set");

    let value = DatabaseManager::get_storage("mentx_products", &ctx)
        .expect("get")
        .expect("value");
    assert_eq!(value, r#"["a","b"]"#);

    DatabaseManager::shutdown();
    let _ = fs::remove_dir_all(data_dir);
}

#[test]
#[serial]
fn lockout_blocks_after_repeated_failures() {
    let data_dir = temp_data_dir("lockout");
    DatabaseManager::initialize(&data_dir, None).expect("init");

    for _ in 0..MAX_FAILED_ATTEMPTS {
        let _ = DatabaseManager::record_failed_login("bob");
    }

    let status = DatabaseManager::login_lockout_status("bob").expect("status");
    assert!(status.locked);

    DatabaseManager::shutdown();
    let _ = fs::remove_dir_all(data_dir);
}

#[test]
#[serial]
fn integrity_check_passes_on_fresh_database() {
    let data_dir = temp_data_dir("integrity");
    let report = DatabaseManager::initialize(&data_dir, None).expect("init");
    assert!(report.healthy);
    assert!(report.integrity_ok);
    assert!(report.foreign_keys_on);
    assert!(report.encryption_enabled);

    DatabaseManager::shutdown();
    let _ = fs::remove_dir_all(data_dir);
}

#[test]
fn in_memory_schema_supports_audit_log() {
    let conn = Connection::open_in_memory().expect("memory db");
    initialize_schema(&conn).expect("schema");

    crate::db::audit_repo::insert_audit(
        &conn,
        "tester",
        "login",
        "session",
        "success",
        "",
    )
    .expect("audit");

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM audit_log", [], |row| row.get(0))
        .expect("count");
    assert_eq!(count, 1);
}

#[test]
#[serial]
fn connection_reopen_after_shutdown() {
    let data_dir = temp_data_dir("reopen");
    DatabaseManager::initialize(&data_dir, None).expect("init");
    let ctx = admin_context();

    DatabaseManager::set_storage("mentx_theme_probe", "dark", &ctx).expect("set");
    DatabaseManager::shutdown();
    DatabaseManager::reopen().expect("reopen");

    let value = DatabaseManager::get_storage("invora_theme", &ctx).ok().flatten();
    let _ = value;

    DatabaseManager::shutdown();
    let _ = fs::remove_dir_all(data_dir);
}

#[test]
fn lockout_status_for_unknown_user_is_unlocked() {
    let conn = Connection::open_in_memory().expect("memory db");
    initialize_schema(&conn).expect("schema");
    let status = check_lockout(&conn, "nobody").expect("status");
    assert!(!status.locked);
    assert_eq!(status.failed_attempts, 0);
}

#[test]
fn record_failed_login_increments_attempts() {
    let conn = Connection::open_in_memory().expect("memory db");
    initialize_schema(&conn).expect("schema");
    let status = record_failed_login(&conn, "alice").expect("record");
    assert_eq!(status.failed_attempts, 1);
    assert!(!status.locked);
}
