use crate::db::config::MAX_VALUE_BYTES;
use crate::db::sql_guard::assert_safe_identifier;

pub fn validate_storage_key(key: &str) -> Result<(), String> {
    assert_safe_identifier(key, "Storage key")
}

pub fn validate_storage_value(value: &str) -> Result<(), String> {
    if value.len() > MAX_VALUE_BYTES {
        return Err("Storage value exceeds maximum allowed size.".to_string());
    }
    Ok(())
}

pub fn validate_required(value: &str, field: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{field} is required."));
    }
    Ok(())
}

pub fn validate_length(value: &str, field: &str, max: usize) -> Result<(), String> {
    if value.len() > max {
        return Err(format!("{field} is too long (max {max} characters)."));
    }
    Ok(())
}

pub fn validate_email(value: &str, field: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let Some((local, domain)) = trimmed.split_once('@') else {
        return Err(format!("{field} is not a valid email address."));
    };
    if local.is_empty() || domain.is_empty() || !domain.contains('.') {
        return Err(format!("{field} is not a valid email address."));
    }
    if trimmed.chars().any(char::is_whitespace) {
        return Err(format!("{field} is not a valid email address."));
    }
    Ok(())
}

pub fn validate_username(username: &str) -> Result<(), String> {
    validate_required(username, "Username")?;
    validate_length(username, "Username", 64)?;
    if username.contains('@') {
        validate_email(username, "Username")?;
    }
    if !username
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '.' || ch == '-')
    {
        return Err("Username contains invalid characters.".to_string());
    }
    Ok(())
}

pub fn validate_audit_action(action: &str) -> Result<(), String> {
    validate_required(action, "Action")?;
    validate_length(action, "Action", 64)?;
    assert_safe_identifier(action, "Action")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_oversized_value() {
        let huge = "x".repeat(MAX_VALUE_BYTES + 1);
        assert!(validate_storage_value(&huge).is_err());
    }

    #[test]
    fn validates_email() {
        assert!(validate_email("user@example.com", "Email").is_ok());
        assert!(validate_email("not-an-email", "Email").is_err());
    }
}
