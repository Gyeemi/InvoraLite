//! Legacy database facade — all SQLite access is routed through `db::DatabaseManager`.

pub use crate::db::manager::{
    get_storage_item, init_database, set_storage_item, shutdown_database,
};

#[allow(dead_code)]
pub fn close_database() -> Result<(), String> {
    shutdown_database();
    Ok(())
}
