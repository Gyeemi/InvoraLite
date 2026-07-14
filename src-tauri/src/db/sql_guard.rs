const FORBIDDEN_KEYWORDS: &[&str] = &[
    "drop", "alter", "attach", "detach", "pragma", "vacuum", "truncate", "exec", "create",
    "reindex",
];

pub fn assert_safe_identifier(value: &str, label: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} cannot be empty."));
    }
    if trimmed.len() > 128 {
        return Err(format!("{label} is too long."));
    }
    let lower = trimmed.to_ascii_lowercase();
    for keyword in FORBIDDEN_KEYWORDS {
        if lower.contains(keyword) {
            return Err(format!("{label} contains forbidden SQL keyword."));
        }
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == ':' || ch == '-' || ch == '.')
    {
        return Err(format!("{label} contains invalid characters."));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_dangerous_key_content() {
        assert!(assert_safe_identifier("mentx_products; DROP TABLE", "key").is_err());
    }

    #[test]
    fn accepts_valid_storage_key() {
        assert!(assert_safe_identifier("mentx_session:auth", "key").is_ok());
    }
}
