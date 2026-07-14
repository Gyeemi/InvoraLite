use chrono::Utc;
use rusqlite::{params, Connection};
use serde::Serialize;

use crate::db::validation::validate_audit_action;

fn audit_timestamp() -> String {
    Utc::now().to_rfc3339()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: i64,
    pub timestamp: String,
    pub username: String,
    pub action: String,
    pub record_affected: String,
    pub status: String,
    pub details: String,
}

pub fn insert_audit(
    conn: &Connection,
    username: &str,
    action: &str,
    record_affected: &str,
    status: &str,
    details: &str,
) -> Result<(), String> {
    validate_audit_action(action)?;

    conn.execute(
        "INSERT INTO audit_log (timestamp, username, action, record_affected, status, details)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            audit_timestamp(),
            username.trim(),
            action.trim(),
            record_affected.trim(),
            status.trim(),
            details.trim()
        ],
    )
    .map_err(|error| format!("Could not write audit log: {error}"))?;

    Ok(())
}

pub fn list_audit(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<AuditEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, username, action, record_affected, status, details
             FROM audit_log
             ORDER BY id DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|error| error.to_string())?;

    let rows = stmt
        .query_map(params![limit, offset], |row| {
            Ok(AuditEntry {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                username: row.get(2)?,
                action: row.get(3)?,
                record_affected: row.get(4)?,
                status: row.get(5)?,
                details: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn audit_storage_mutation(
    conn: &Connection,
    username: &str,
    key: &str,
    action: &str,
    status: &str,
) {
    let _ = insert_audit(conn, username, action, key, status, "");
}

pub fn map_storage_key_to_action(key: &str, is_remove: bool) -> Option<&'static str> {
    if is_remove {
        return Some("storage_remove");
    }
    match key {
        "mentx_products" => Some("inventory_update"),
        "mentx_sales" => Some("stock_change"),
        "mentx_purchases" => Some("inventory_update"),
        "mentx_staff" => Some("user_change"),
        "mentx_business" => Some("settings_change"),
        _ => None,
    }
}
