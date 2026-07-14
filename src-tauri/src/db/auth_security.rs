use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection};
use serde::Serialize;

use crate::db::validation::validate_username;

pub const MAX_FAILED_ATTEMPTS: i32 = 5;
pub const LOCKOUT_MINUTES: i64 = 15;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockoutStatus {
    pub locked: bool,
    pub failed_attempts: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locked_until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining_seconds: Option<i64>,
}

pub fn check_lockout(conn: &Connection, username: &str) -> Result<LockoutStatus, String> {
    validate_username(username)?;

    let normalized = username.trim().to_lowercase();
    let row: Option<(i32, Option<String>)> = conn
        .query_row(
            "SELECT failed_attempts, locked_until FROM auth_lockout WHERE username = ?1",
            [&normalized],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let Some((failed_attempts, locked_until)) = row else {
        return Ok(LockoutStatus {
            locked: false,
            failed_attempts: 0,
            locked_until: None,
            remaining_seconds: None,
        });
    };

    if let Some(until_raw) = locked_until {
        if let Ok(until) = DateTime::parse_from_rfc3339(&until_raw) {
            let until_utc = until.with_timezone(&Utc);
            if until_utc > Utc::now() {
                let remaining = (until_utc - Utc::now()).num_seconds().max(0);
                return Ok(LockoutStatus {
                    locked: true,
                    failed_attempts,
                    locked_until: Some(until_raw),
                    remaining_seconds: Some(remaining),
                });
            }
        }
        clear_lockout(conn, username)?;
    }

    Ok(LockoutStatus {
        locked: false,
        failed_attempts,
        locked_until: None,
        remaining_seconds: None,
    })
}

pub fn record_failed_login(conn: &Connection, username: &str) -> Result<LockoutStatus, String> {
    validate_username(username)?;
    let normalized = username.trim().to_lowercase();

    let current = check_lockout(conn, username)?;
    if current.locked {
        return Ok(current);
    }

    let next_attempts = current.failed_attempts + 1;
    let locked_until = if next_attempts >= MAX_FAILED_ATTEMPTS {
        Some((Utc::now() + Duration::minutes(LOCKOUT_MINUTES)).to_rfc3339())
    } else {
        None
    };

    conn.execute(
        "INSERT INTO auth_lockout (username, failed_attempts, locked_until, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(username) DO UPDATE SET
           failed_attempts = excluded.failed_attempts,
           locked_until = excluded.locked_until,
           updated_at = excluded.updated_at",
        params![normalized, next_attempts, locked_until],
    )
    .map_err(|error| format!("Could not record failed login: {error}"))?;

    check_lockout(conn, username)
}

pub fn clear_lockout(conn: &Connection, username: &str) -> Result<(), String> {
    validate_username(username)?;
    let normalized = username.trim().to_lowercase();
    conn.execute("DELETE FROM auth_lockout WHERE username = ?1", [&normalized])
        .map_err(|error| format!("Could not clear login lockout: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::initialize_schema;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("memory db");
        initialize_schema(&conn).expect("schema");
        conn
    }

    #[test]
    fn locks_after_repeated_failures() {
        let conn = test_conn();
        for _ in 0..MAX_FAILED_ATTEMPTS {
            let status = record_failed_login(&conn, "alice").expect("record");
            if status.locked {
                break;
            }
        }
        let status = check_lockout(&conn, "alice").expect("check");
        assert!(status.locked);
    }
}
