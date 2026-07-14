use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use zip::read::ZipArchive;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::db::encryption_key::{decrypt_bytes, encrypt_bytes};
use crate::db::errors::DbError;

pub const MANIFEST_NAME: &str = "manifest.json";
pub const LEGACY_DB_ENTRY: &str = "invora.db";
pub const VAULT_ENTRY: &str = "invora.db.vault";
const BACKUP_FORMAT: &str = "invora-db-backup";
const BACKUP_VERSION_PLAINTEXT: u32 = 1;
const BACKUP_VERSION_ENCRYPTED: u32 = 2;
const KDF_SALT_LEN: usize = 16;

#[derive(Debug, Clone)]
pub enum BackupWriteKey<'a> {
    Machine(&'a [u8]),
    Password(&'a str),
}

#[derive(Debug, Clone)]
pub enum BackupReadKey<'a> {
    Machine(&'a [u8]),
    Password(&'a str),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format: String,
    pub version: u32,
    #[serde(default)]
    pub encrypted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kdf_salt: Option<String>,
    pub app_version: String,
    pub exported_at: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInspection {
    pub version: u32,
    pub encrypted: bool,
    pub encryption_mode: Option<String>,
    pub requires_password: bool,
}

pub fn inspect_backup(source: &Path) -> Result<BackupInspection, String> {
    let manifest = read_manifest(source)?;
    Ok(BackupInspection {
        version: manifest.version,
        encrypted: manifest.encrypted,
        encryption_mode: manifest.encryption_mode.clone(),
        requires_password: manifest.encryption_mode.as_deref() == Some("password"),
    })
}

pub fn write_backup_zip(
    snapshot_path: &Path,
    destination: &Path,
    key: BackupWriteKey<'_>,
) -> Result<(), DbError> {
    let db_bytes = fs::read(snapshot_path).map_err(|error| DbError::Internal(error.to_string()))?;

    let (manifest, payload) = match key {
        BackupWriteKey::Machine(machine_key) => {
            let encrypted = encrypt_bytes(machine_key, &db_bytes).map_err(DbError::Internal)?;
            let manifest = BackupManifest {
                format: BACKUP_FORMAT.to_string(),
                version: BACKUP_VERSION_ENCRYPTED,
                encrypted: true,
                encryption_mode: Some("machine".to_string()),
                kdf_salt: None,
                app_version: env!("CARGO_PKG_VERSION").to_string(),
                exported_at: Utc::now().to_rfc3339(),
                files: vec![VAULT_ENTRY.to_string()],
            };
            (manifest, encrypted)
        }
        BackupWriteKey::Password(password) => {
            validate_backup_password(password)?;
            let mut salt = [0u8; KDF_SALT_LEN];
            rand::rngs::OsRng.fill_bytes(&mut salt);
            let derived = derive_backup_key(password, &salt).map_err(DbError::Internal)?;
            let encrypted = encrypt_bytes(&derived, &db_bytes).map_err(DbError::Internal)?;
            let manifest = BackupManifest {
                format: BACKUP_FORMAT.to_string(),
                version: BACKUP_VERSION_ENCRYPTED,
                encrypted: true,
                encryption_mode: Some("password".to_string()),
                kdf_salt: Some(BASE64.encode(salt)),
                app_version: env!("CARGO_PKG_VERSION").to_string(),
                exported_at: Utc::now().to_rfc3339(),
                files: vec![VAULT_ENTRY.to_string()],
            };
            (manifest, encrypted)
        }
    };

    write_zip(destination, &manifest, VAULT_ENTRY, &payload)?;
    verify_backup_zip(destination)?;
    Ok(())
}

pub fn extract_backup_database(source: &Path, key: Option<BackupReadKey<'_>>) -> Result<Vec<u8>, String> {
    let manifest = read_manifest(source)?;

    if manifest.format != BACKUP_FORMAT {
        return Err("This file is not an Invora database backup.".to_string());
    }

    match manifest.version {
        BACKUP_VERSION_PLAINTEXT => extract_plaintext_backup(source, &manifest),
        BACKUP_VERSION_ENCRYPTED => extract_encrypted_backup(source, &manifest, key),
        _ => Err("Unsupported backup version.".to_string()),
    }
}

fn extract_plaintext_backup(source: &Path, manifest: &BackupManifest) -> Result<Vec<u8>, String> {
    if !manifest.files.iter().any(|name| name == LEGACY_DB_ENTRY) {
        return Err("Backup file does not contain invora.db.".to_string());
    }

    let file = File::open(source).map_err(|error| format!("Could not open backup file: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid backup ZIP file: {error}"))?;
    let mut db_entry = archive
        .by_name(LEGACY_DB_ENTRY)
        .map_err(|_| "Backup file is missing invora.db.".to_string())?;
    let mut db_bytes = Vec::new();
    db_entry
        .read_to_end(&mut db_bytes)
        .map_err(|error| format!("Could not read backup database: {error}"))?;
    Ok(db_bytes)
}

fn extract_encrypted_backup(
    source: &Path,
    manifest: &BackupManifest,
    key: Option<BackupReadKey<'_>>,
) -> Result<Vec<u8>, String> {
    if !manifest.files.iter().any(|name| name == VAULT_ENTRY) {
        return Err("Backup file does not contain encrypted database payload.".to_string());
    }

    let file = File::open(source).map_err(|error| format!("Could not open backup file: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid backup ZIP file: {error}"))?;
    let mut vault_entry = archive
        .by_name(VAULT_ENTRY)
        .map_err(|_| "Backup file is missing invora.db.vault.".to_string())?;
    let mut payload = Vec::new();
    vault_entry
        .read_to_end(&mut payload)
        .map_err(|error| format!("Could not read encrypted backup payload: {error}"))?;

    let mode = manifest
        .encryption_mode
        .as_deref()
        .ok_or_else(|| "Encrypted backup is missing encryption mode metadata.".to_string())?;

    match mode {
        "machine" => {
            let machine_key = match key {
                Some(BackupReadKey::Machine(bytes)) => bytes,
                _ => return Err("This backup can only be restored on the same Windows user profile.".to_string()),
            };
            decrypt_bytes(machine_key, &payload)
        }
        "password" => {
            let password = match key {
                Some(BackupReadKey::Password(value)) => value,
                _ => return Err("BACKUP_PASSWORD_REQUIRED".to_string()),
            };
            let salt_b64 = manifest
                .kdf_salt
                .as_deref()
                .ok_or_else(|| "Encrypted backup is missing key derivation salt.".to_string())?;
            let salt = BASE64
                .decode(salt_b64)
                .map_err(|_| "Encrypted backup has an invalid key derivation salt.".to_string())?;
            let derived = derive_backup_key(password, &salt)?;
            decrypt_bytes(&derived, &payload)
        }
        _ => Err("Unsupported backup encryption mode.".to_string()),
    }
}

fn write_zip(
    destination: &Path,
    manifest: &BackupManifest,
    entry_name: &str,
    payload: &[u8],
) -> Result<(), DbError> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| DbError::Internal(error.to_string()))?;
    }

    let file = File::create(destination).map_err(|error| DbError::Internal(error.to_string()))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file(entry_name, options)
        .map_err(|error| DbError::Internal(error.to_string()))?;
    zip.write_all(payload)
        .map_err(|error| DbError::Internal(error.to_string()))?;

    let manifest_json = serde_json::to_string_pretty(manifest)
        .map_err(|error| DbError::Internal(error.to_string()))?;
    zip.start_file(MANIFEST_NAME, options)
        .map_err(|error| DbError::Internal(error.to_string()))?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|error| DbError::Internal(error.to_string()))?;

    zip.finish()
        .map_err(|error| DbError::Internal(error.to_string()))?;
    Ok(())
}

fn read_manifest(source: &Path) -> Result<BackupManifest, String> {
    let file = File::open(source).map_err(|error| format!("Could not open backup file: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid backup ZIP file: {error}"))?;
    let mut manifest_file = archive
        .by_name(MANIFEST_NAME)
        .map_err(|_| "Backup file is missing manifest.json.".to_string())?;
    let mut manifest_raw = String::new();
    manifest_file
        .read_to_string(&mut manifest_raw)
        .map_err(|error| format!("Could not read backup manifest: {error}"))?;
    serde_json::from_str(&manifest_raw).map_err(|error| format!("Backup manifest is invalid: {error}"))
}

fn verify_backup_zip(path: &Path) -> Result<(), DbError> {
    let manifest = read_manifest(path).map_err(DbError::Internal)?;
    if manifest.format != BACKUP_FORMAT {
        return Err(DbError::Internal("Backup manifest verification failed.".to_string()));
    }
    if manifest.files.is_empty() {
        return Err(DbError::Internal("Backup manifest verification failed.".to_string()));
    }
    Ok(())
}

fn validate_backup_password(password: &str) -> Result<(), DbError> {
    if password.len() < 8 {
        return Err(DbError::Validation(
            "Backup password must be at least 8 characters.".to_string(),
        ));
    }
    let has_letter = password.chars().any(|ch| ch.is_ascii_alphabetic());
    let has_digit = password.chars().any(|ch| ch.is_ascii_digit());
    if !has_letter || !has_digit {
        return Err(DbError::Validation(
            "Backup password must include at least one letter and one number.".to_string(),
        ));
    }
    Ok(())
}

fn derive_backup_key(password: &str, salt: &[u8]) -> Result<Vec<u8>, String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|error| error.to_string())?;
    Ok(key.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    fn temp_path(name: &str) -> std::path::PathBuf {
        temp_dir().join(format!("invora_backup_test_{name}_{}", std::process::id()))
    }

    #[test]
    fn password_backup_roundtrip() {
        let dir = temp_path("password");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("dir");

        let snapshot = dir.join("snapshot.db");
        fs::write(&snapshot, b"SQLite format 3\x00encrypted-backup").expect("write snapshot");
        let backup = dir.join("backup.zip");

        write_backup_zip(
            &snapshot,
            &backup,
            BackupWriteKey::Password("BackupPass1"),
        )
        .expect("write");

        let inspection = inspect_backup(&backup).expect("inspect");
        assert!(inspection.encrypted);
        assert!(inspection.requires_password);

        let restored = extract_backup_database(
            &backup,
            Some(BackupReadKey::Password("BackupPass1")),
        )
        .expect("restore");
        assert_eq!(restored, b"SQLite format 3\x00encrypted-backup");

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn machine_backup_roundtrip() {
        let dir = temp_path("machine");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("dir");

        let machine_key = {
            let mut key = vec![0u8; 32];
            rand::rngs::OsRng.fill_bytes(&mut key);
            key
        };
        let snapshot = dir.join("snapshot.db");
        fs::write(&snapshot, b"SQLite format 3\x00machine-backup").expect("write snapshot");
        let backup = dir.join("backup.zip");

        write_backup_zip(&snapshot, &backup, BackupWriteKey::Machine(&machine_key)).expect("write");

        let restored = extract_backup_database(&backup, Some(BackupReadKey::Machine(&machine_key)))
            .expect("restore");
        assert_eq!(restored, b"SQLite format 3\x00machine-backup");

        let _ = fs::remove_dir_all(dir);
    }
}
