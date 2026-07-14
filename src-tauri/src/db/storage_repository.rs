use rusqlite::{params, Connection, OptionalExtension};

use crate::db::errors::DbError;
use crate::db::validation::{validate_storage_key, validate_storage_value};

pub fn get(conn: &Connection, key: &str) -> Result<Option<String>, DbError> {
    validate_storage_key(key).map_err(DbError::Validation)?;

    let mut stmt = conn
        .prepare("SELECT value FROM app_storage WHERE key = ?1")
        .map_err(|error| DbError::Internal(error.to_string()))?;

    stmt.query_row(params![key], |row| row.get(0))
        .optional()
        .map_err(|error| DbError::Internal(error.to_string()))
}

pub fn set(conn: &Connection, key: &str, value: &str) -> Result<(), DbError> {
    validate_storage_key(key).map_err(DbError::Validation)?;
    validate_storage_value(value).map_err(DbError::Validation)?;

    conn.execute(
        "INSERT INTO app_storage (key, value, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at",
        params![key, value],
    )
    .map_err(|error| DbError::Internal(error.to_string()))?;

    Ok(())
}

pub fn remove(conn: &Connection, key: &str) -> Result<bool, DbError> {
    validate_storage_key(key).map_err(DbError::Validation)?;

    let changed = conn
        .execute("DELETE FROM app_storage WHERE key = ?1", params![key])
        .map_err(|error| DbError::Internal(error.to_string()))?;

    Ok(changed > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::initialize_schema;
    use rusqlite::Connection;

    #[test]
    fn rejects_sql_injection_key() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();
        let result = set(&conn, "bad; DROP TABLE app_storage", "value");
        assert!(matches!(result, Err(DbError::Validation(_))));
    }
}
