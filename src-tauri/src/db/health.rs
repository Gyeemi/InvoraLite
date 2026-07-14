use rusqlite::Connection;
use serde::Serialize;

use crate::db::encryption_key;
use crate::db::errors::DbError;
use crate::db::schema::{required_tables_exist, schema_version, SCHEMA_VERSION};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub healthy: bool,
    pub database_exists: bool,
    pub schema_ok: bool,
    pub schema_version: i32,
    pub expected_schema_version: i32,
    pub integrity_ok: bool,
    pub foreign_keys_on: bool,
    pub encryption_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

pub fn run_health_check(conn: &Connection, database_exists: bool, data_dir: &std::path::Path) -> HealthReport {
    let mut report = HealthReport {
        healthy: false,
        database_exists,
        schema_ok: false,
        schema_version: 0,
        expected_schema_version: SCHEMA_VERSION,
        integrity_ok: false,
        foreign_keys_on: false,
        encryption_enabled: encryption_key::encryption_active(data_dir),
        message: None,
    };

    let fk_enabled: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .unwrap_or(0);
    report.foreign_keys_on = fk_enabled == 1;

    if let Ok(version) = schema_version(conn) {
        report.schema_version = version;
    }

    report.schema_ok = required_tables_exist(conn).is_ok()
        && report.schema_version == SCHEMA_VERSION;

    report.integrity_ok = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        .map(|result| result.eq_ignore_ascii_case("ok"))
        .unwrap_or(false);

    if !report.encryption_enabled {
        report.message = Some("Database encryption is not configured.".to_string());
    } else if !report.integrity_ok {
        report.message = Some("Database integrity check failed.".to_string());
    } else if !report.schema_ok {
        report.message = Some("Database schema verification failed.".to_string());
    } else if !report.foreign_keys_on {
        report.message = Some("Foreign key enforcement is disabled.".to_string());
    }

    report.healthy = report.database_exists
        && report.encryption_enabled
        && report.integrity_ok
        && report.schema_ok
        && report.foreign_keys_on;

    report
}

pub fn ensure_healthy(conn: &Connection, database_exists: bool, data_dir: &std::path::Path) -> Result<HealthReport, DbError> {
    let report = run_health_check(conn, database_exists, data_dir);
    if report.healthy {
        Ok(report)
    } else {
        let detail = report
            .message
            .clone()
            .unwrap_or_else(|| "Database health check failed.".to_string());
        Err(DbError::Corruption(detail))
    }
}
