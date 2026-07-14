use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use serde::Serialize;
use subtle::ConstantTimeEq;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordVerifyResult {
    pub valid: bool,
    pub upgraded_hash: Option<String>,
}

pub fn is_password_hash(value: &str) -> bool {
    value.starts_with("$argon2")
}

pub fn hash_password(password: &str) -> Result<String, String> {
    validate_password_complexity(password)?;
    hash_password_unchecked(password)
}

fn hash_password_unchecked(password: &str) -> Result<String, String> {
    if password.trim().is_empty() {
        return Err("Password cannot be empty.".into());
    }

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| error.to_string())
}

fn validate_password_complexity(password: &str) -> Result<(), String> {
    if password.len() < 8 {
        return Err("Password must be at least 8 characters.".into());
    }
    let has_letter = password.chars().any(|ch| ch.is_ascii_alphabetic());
    let has_digit = password.chars().any(|ch| ch.is_ascii_digit());
    if !has_letter || !has_digit {
        return Err("Password must include at least one letter and one number.".into());
    }
    Ok(())
}

pub fn verify_password(password: &str, stored_hash: &str) -> bool {
    let parsed = match PasswordHash::new(stored_hash) {
        Ok(hash) => hash,
        Err(_) => return false,
    };

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

fn legacy_plaintext_match(password: &str, stored: &str) -> bool {
    password.as_bytes().ct_eq(stored.as_bytes()).into()
}

pub fn verify_password_with_migration(password: &str, stored: &str) -> PasswordVerifyResult {
    if is_password_hash(stored) {
        return PasswordVerifyResult {
            valid: verify_password(password, stored),
            upgraded_hash: None,
        };
    }

    if !legacy_plaintext_match(password, stored) {
        return PasswordVerifyResult {
            valid: false,
            upgraded_hash: None,
        };
    }

    PasswordVerifyResult {
        valid: true,
        upgraded_hash: hash_password_unchecked(password).ok(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_and_verifies_password() {
        let hash = hash_password("secret-pass1").expect("hash");
        assert!(is_password_hash(&hash));
        assert!(verify_password("secret-pass1", &hash));
        assert!(!verify_password("wrong-pass", &hash));
    }

    #[test]
    fn migrates_legacy_plaintext() {
        let result = verify_password_with_migration("legacy", "legacy");
        assert!(result.valid);
        let upgraded = result.upgraded_hash.expect("upgraded hash");
        assert!(is_password_hash(&upgraded));
        assert!(verify_password("legacy", &upgraded));
    }
}
