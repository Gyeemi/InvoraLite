use serde::Serialize;

#[derive(Debug)]
pub enum DbError {
    NotInitialized,
    Busy,
    Validation(String),
    Authorization(String),
    Corruption(String),
    Internal(String),
}

impl DbError {
    pub fn user_message(&self) -> &'static str {
        match self {
            DbError::NotInitialized => "The database is not ready. Please restart the application.",
            DbError::Busy => "The database is busy. Please try again.",
            DbError::Validation(_) => "Some of the information provided is invalid.",
            DbError::Authorization(_) => "You do not have permission to perform this action.",
            DbError::Corruption(_) => "The database may be damaged. Restore from a backup.",
            DbError::Internal(_) => "A database error occurred. Please try again.",
        }
    }

    pub fn log_detail(&self) -> String {
        match self {
            DbError::Validation(message)
            | DbError::Authorization(message)
            | DbError::Corruption(message)
            | DbError::Internal(message) => message.clone(),
            DbError::NotInitialized => "Database is not initialized.".to_string(),
            DbError::Busy => "Database mutex poisoned or busy.".to_string(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl StorageResult {
    pub fn ok() -> Self {
        Self {
            success: true,
            error: None,
        }
    }

    pub fn err(error: DbError) -> Self {
        eprintln!("storage error: {}", error.log_detail());
        let message = match &error {
            DbError::Validation(detail) | DbError::Authorization(detail) => detail.clone(),
            _ => error.user_message().to_string(),
        };
        Self {
            success: false,
            error: Some(message),
        }
    }
}
