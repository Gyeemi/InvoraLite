use rusqlite::Connection;

pub const SCHEMA_VERSION: i32 = 1;

pub fn initialize_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS schema_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT OR IGNORE INTO schema_meta (id, version) VALUES (1, 0);

        CREATE TABLE IF NOT EXISTS app_storage (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            username TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            record_affected TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

        CREATE TABLE IF NOT EXISTS auth_lockout (
            username TEXT PRIMARY KEY NOT NULL,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            locked_until TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        ",
    )
    .map_err(|error| format!("Could not initialize database schema: {error}"))?;

    conn.execute(
        "UPDATE schema_meta SET version = ?1, updated_at = datetime('now') WHERE id = 1",
        [SCHEMA_VERSION],
    )
    .map_err(|error| format!("Could not update schema version: {error}"))?;

    Ok(())
}

pub fn schema_version(conn: &Connection) -> Result<i32, String> {
    conn.query_row(
        "SELECT version FROM schema_meta WHERE id = 1",
        [],
        |row| row.get(0),
    )
    .map_err(|error| format!("Could not read schema version: {error}"))
}

pub fn required_tables_exist(conn: &Connection) -> Result<(), String> {
    let tables = ["app_storage", "audit_log", "auth_lockout", "schema_meta"];
    for table in tables {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table],
                |row| row.get(0),
            )
            .map_err(|error| format!("Could not verify table {table}: {error}"))?;
        if exists == 0 {
            return Err(format!("Required table missing: {table}"));
        }
    }
    Ok(())
}
