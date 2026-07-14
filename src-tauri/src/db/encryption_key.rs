use std::fs;
use std::path::{Path, PathBuf};

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;

use crate::db::config::{database_file_path, vault_file_path};

const KEY_SIZE: usize = 32;
const KEY_FILE_NAME: &str = ".dbkey";
const NONCE_LEN: usize = 12;
const VAULT_MAGIC: &[u8] = b"INVORA_VAULT1";

pub fn key_file_path(data_dir: &Path) -> PathBuf {
    database_file_path(data_dir)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| data_dir.to_path_buf())
        .join(KEY_FILE_NAME)
}

pub fn load_or_create_key(data_dir: &Path) -> Result<Vec<u8>, String> {
    let path = key_file_path(data_dir);
    if path.exists() {
        return load_key(&path);
    }

    let key = generate_key();
    save_key(&path, &key)?;
    Ok(key)
}

pub fn unseal_database(data_dir: &Path, key: &[u8]) -> Result<(), String> {
    let db_path = database_file_path(data_dir);
    let vault_path = vault_file_path(data_dir);

    // Unclean exit leaves plaintext DB. Refresh the vault from it so the
    // encrypted copy is not stale, then keep the plaintext open for this session.
    if db_path.exists() && vault_path.exists() {
        let _ = refresh_vault_from_plaintext(data_dir, key);
        return Ok(());
    }

    if db_path.exists() {
        return Ok(());
    }
    if !vault_path.exists() {
        return Ok(());
    }

    let payload = fs::read(&vault_path).map_err(|error| error.to_string())?;
    let plaintext = decrypt_payload(key, &payload)?;

    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&db_path, plaintext).map_err(|error| error.to_string())?;
    Ok(())
}

/// Write/overwrite the vault from the live plaintext DB without deleting the DB.
/// Used after unclean exits so the sealed copy matches the latest data.
pub fn refresh_vault_from_plaintext(data_dir: &Path, key: &[u8]) -> Result<(), String> {
    let db_path = database_file_path(data_dir);
    if !db_path.exists() {
        return Ok(());
    }

    let plaintext = fs::read(&db_path).map_err(|error| error.to_string())?;
    let payload = encrypt_payload(key, &plaintext)?;
    let vault_path = vault_file_path(data_dir);

    if let Some(parent) = vault_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let temp_vault = vault_path.with_extension("vault.tmp");
    fs::write(&temp_vault, payload).map_err(|error| error.to_string())?;
    if vault_path.exists() {
        fs::remove_file(&vault_path).map_err(|error| error.to_string())?;
    }
    fs::rename(&temp_vault, &vault_path).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn seal_database(data_dir: &Path, key: &[u8]) -> Result<(), String> {
    let db_path = database_file_path(data_dir);
    if !db_path.exists() {
        return Ok(());
    }

    let plaintext = fs::read(&db_path).map_err(|error| error.to_string())?;
    let payload = encrypt_payload(key, &plaintext)?;
    let vault_path = vault_file_path(data_dir);

    if let Some(parent) = vault_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let temp_vault = vault_path.with_extension("vault.tmp");
    fs::write(&temp_vault, payload).map_err(|error| error.to_string())?;
    if vault_path.exists() {
        fs::remove_file(&vault_path).map_err(|error| error.to_string())?;
    }
    fs::rename(&temp_vault, &vault_path).map_err(|error| error.to_string())?;

    fs::remove_file(&db_path).map_err(|error| error.to_string())?;
    for suffix in ["-wal", "-shm"] {
        let journal = PathBuf::from(format!("{}{suffix}", db_path.to_string_lossy()));
        if journal.exists() {
            let _ = fs::remove_file(journal);
        }
    }

    Ok(())
}

pub fn encryption_active(data_dir: &Path) -> bool {
    key_file_path(data_dir).exists()
        && (vault_file_path(data_dir).exists() || database_file_path(data_dir).exists())
}

pub fn encrypt_bytes(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    encrypt_payload(key, plaintext)
}

pub fn decrypt_bytes(key: &[u8], payload: &[u8]) -> Result<Vec<u8>, String> {
    decrypt_payload(key, payload)
}

fn encrypt_payload(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    validate_key(key)?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|error| error.to_string())?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext)
        .map_err(|error| error.to_string())?;

    let mut payload = Vec::with_capacity(VAULT_MAGIC.len() + NONCE_LEN + ciphertext.len());
    payload.extend_from_slice(VAULT_MAGIC);
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);
    Ok(payload)
}

fn decrypt_payload(key: &[u8], payload: &[u8]) -> Result<Vec<u8>, String> {
    validate_key(key)?;
    if payload.len() < VAULT_MAGIC.len() + NONCE_LEN + 16 {
        return Err("Encrypted database payload is too short.".to_string());
    }
    if &payload[..VAULT_MAGIC.len()] != VAULT_MAGIC {
        return Err("Encrypted database format is invalid.".to_string());
    }

    let nonce_start = VAULT_MAGIC.len();
    let nonce_end = nonce_start + NONCE_LEN;
    let nonce = Nonce::from_slice(&payload[nonce_start..nonce_end]);
    let ciphertext = &payload[nonce_end..];

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|error| error.to_string())?;
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Could not decrypt database. The key may be invalid.".to_string())
}

fn validate_key(key: &[u8]) -> Result<(), String> {
    if key.len() != KEY_SIZE {
        return Err("Invalid database encryption key length.".to_string());
    }
    Ok(())
}

fn generate_key() -> Vec<u8> {
    let mut key = vec![0u8; KEY_SIZE];
    rand::rngs::OsRng.fill_bytes(&mut key);
    key
}

#[cfg(windows)]
fn save_key(path: &Path, key: &[u8]) -> Result<(), String> {
    use windows_dpapi::{encrypt_data, Scope};

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let protected = encrypt_data(key, Scope::User)
        .map_err(|error| format!("Could not protect database key: {error}"))?;
    fs::write(path, protected).map_err(|error| error.to_string())
}

#[cfg(windows)]
fn load_key(path: &Path) -> Result<Vec<u8>, String> {
    use windows_dpapi::{decrypt_data, Scope};

    let protected = fs::read(path).map_err(|error| error.to_string())?;
    let key = decrypt_data(&protected, Scope::User)
        .map_err(|error| format!("Could not unlock database key: {error}"))?;
    if key.len() != KEY_SIZE {
        return Err("Stored database key is invalid.".to_string());
    }
    Ok(key)
}

#[cfg(not(windows))]
fn save_key(_path: &Path, _key: &[u8]) -> Result<(), String> {
    Err("Database encryption is only supported on Windows.".to_string())
}

#[cfg(not(windows))]
fn load_key(_path: &Path) -> Result<Vec<u8>, String> {
    Err("Database encryption is only supported on Windows.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = generate_key();
        let plain = b"SQLite format 3\x00test payload";
        let payload = encrypt_payload(&key, plain).expect("encrypt");
        let restored = decrypt_payload(&key, &payload).expect("decrypt");
        assert_eq!(restored, plain);
    }

    #[test]
    #[cfg(windows)]
    fn dpapi_roundtrip_key() {
        let dir = temp_dir().join(format!("invora_key_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("dir");
        let path = dir.join(".dbkey");
        let key = generate_key();
        save_key(&path, &key).expect("save");
        let loaded = load_key(&path).expect("load");
        assert_eq!(loaded, key);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    #[cfg(windows)]
    fn seal_unseal_roundtrip() {
        use crate::db::config::{database_file_path, vault_file_path};

        let data_dir = temp_dir().join(format!("invora_vault_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&data_dir);
        fs::create_dir_all(&data_dir).expect("dir");

        let key = load_or_create_key(&data_dir).expect("key");
        let db_path = database_file_path(&data_dir);
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).expect("parent");
        }
        fs::write(&db_path, b"SQLite format 3\x00sample").expect("write db");

        seal_database(&data_dir, &key).expect("seal");
        assert!(!db_path.exists());
        assert!(vault_file_path(&data_dir).exists());

        unseal_database(&data_dir, &key).expect("unseal");
        assert!(db_path.exists());
        let restored = fs::read(&db_path).expect("read");
        assert_eq!(restored, b"SQLite format 3\x00sample");

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    #[cfg(windows)]
    fn unclean_exit_refreshes_stale_vault() {
        use crate::db::config::{database_file_path, vault_file_path};

        let data_dir = temp_dir().join(format!("invora_vault_unclean_{}", std::process::id()));
        let _ = fs::remove_dir_all(&data_dir);
        fs::create_dir_all(&data_dir).expect("dir");

        let key = load_or_create_key(&data_dir).expect("key");
        let db_path = database_file_path(&data_dir);
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).expect("parent");
        }
        fs::write(&db_path, b"old-db").expect("write");
        seal_database(&data_dir, &key).expect("seal");
        // Simulate unclean exit: plaintext reappears with newer content while vault is stale.
        fs::write(&db_path, b"new-db-after-crash").expect("rewrite");
        assert!(vault_file_path(&data_dir).exists());

        unseal_database(&data_dir, &key).expect("recover");
        assert!(db_path.exists());
        assert_eq!(fs::read(&db_path).expect("read"), b"new-db-after-crash");

        // Vault should now match the recovered plaintext (without deleting the DB).
        fs::remove_file(&db_path).expect("remove db");
        unseal_database(&data_dir, &key).expect("unseal refreshed vault");
        assert_eq!(fs::read(&db_path).expect("read"), b"new-db-after-crash");

        let _ = fs::remove_dir_all(data_dir);
    }
}
