use base64::{engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD}, Engine};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::io::{Cursor, Read};
use zip::ZipArchive;

use crate::database::{get_storage_item, set_storage_item};
use crate::device::get_device_id;

type HmacSha256 = Hmac<Sha256>;

const LICENSE_STORAGE_KEY: &str = "invora_license_key";
const TRIAL_START_KEY: &str = "invora_trial_start";
const TRIAL_USED_KEY: &str = "invora_trial_used";
const TRIAL_MIGRATION_V60_KEY: &str = "invora_trial_migrated_v60";
const TRIAL_DAYS: i64 = 60;
const LEGACY_TRIAL_DAYS: i64 = 14;
const PREFIX: &str = "INVORA";
const PRODUCT_NAME: &str = "InvoraLite";
const BUSINESS_STORAGE_KEY: &str = "mentx_business";

/// Dev fallback only — production builds must set INVORA_LICENSE_SECRET at compile time.
const DEFAULT_LICENSE_SECRET: &str = "REPLACE-WITH-A-LONG-RANDOM-SECRET-AT-LEAST-32-CHARS";
/// Dev fallback only — production builds must set INVORA_LICENSE_ZIP_PASSWORD at compile time.
const DEFAULT_LICENSE_ZIP_PASSWORD: &str = "InvoraLite@2026";

fn license_secret() -> &'static str {
    option_env!("INVORA_LICENSE_SECRET")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_LICENSE_SECRET)
}

fn license_zip_password() -> &'static str {
    option_env!("INVORA_LICENSE_ZIP_PASSWORD")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_LICENSE_ZIP_PASSWORD)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub licensed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trial: Option<bool>,
    pub device_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trial_started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trial_ends_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trial_used: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub days_remaining: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub days_remaining: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub already_started: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub days_remaining: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trial_ends_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LicensePayload {
    #[serde(rename = "deviceId")]
    device_id: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
    #[serde(rename = "customerName", default)]
    customer_name: String,
}

#[derive(Debug, Deserialize)]
struct ZipLicenseFile {
    #[serde(rename = "Device ID")]
    device_id: String,
    product: String,
    #[serde(rename = "user e-mail")]
    user_email: String,
    #[serde(rename = "Vallid for", alias = "Valid for")]
    valid_for: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct StoredLicense {
    device_id: String,
    product: String,
    email: String,
    valid_for: String,
    expires_at: String,
    activated_at: String,
    #[serde(default)]
    customer_name: String,
}

#[derive(Debug, Deserialize)]
struct BusinessRecord {
    email: String,
    #[serde(rename = "businessName", default)]
    business_name: String,
    #[serde(rename = "username", default)]
    username: String,
}

fn sign_payload(payload_b64: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(license_secret().as_bytes()).expect("hmac key");
    mac.update(payload_b64.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }
}

fn parse_license_key(license_key: &str) -> Option<(String, String)> {
    let trimmed = license_key.trim();
    let prefix = format!("{PREFIX}-");
    if !trimmed.starts_with(&prefix) {
        return None;
    }
    let rest = &trimmed[prefix.len()..];
    let last_dash = rest.rfind('-')?;
    if last_dash == 0 {
        return None;
    }
    Some((rest[..last_dash].to_string(), rest[last_dash + 1..].to_string()))
}

fn verify_license_key(license_key: &str, current_device_id: &str) -> Result<LicensePayload, String> {
    let (payload_b64, signature) =
        parse_license_key(license_key).ok_or("Invalid license format.")?;

    let expected = sign_payload(&payload_b64);
    if signature != expected {
        return Err("Invalid license key.".to_string());
    }

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(&payload_b64)
        .map_err(|_| "Invalid license payload.".to_string())?;
    let payload_str = String::from_utf8(payload_bytes)
        .map_err(|_| "Invalid license payload.".to_string())?;
    let payload: LicensePayload =
        serde_json::from_str(&payload_str).map_err(|_| "Invalid license payload.".to_string())?;

    if payload.device_id != current_device_id {
        return Err("This license is not valid for this device.".to_string());
    }

    let expires_at: DateTime<Utc> = payload
        .expires_at
        .parse()
        .map_err(|_| "Invalid expiry date in license.".to_string())?;

    if expires_at < Utc::now() {
        return Err("License has expired. Please renew.".to_string());
    }

    Ok(payload)
}

fn parse_expiry_date(expires_at: &str) -> Result<DateTime<Utc>, String> {
    if let Ok(dt) = expires_at.parse::<DateTime<Utc>>() {
        return Ok(dt);
    }

    format!("{}T23:59:59Z", expires_at.trim())
        .parse::<DateTime<Utc>>()
        .map_err(|_| "Invalid expiry date in licence.".to_string())
}

fn days_remaining(expires_at: &str) -> i64 {
    if let Ok(dt) = parse_expiry_date(expires_at) {
        let diff = dt - Utc::now();
        (diff.num_seconds() as f64 / 86400.0).ceil() as i64
    } else {
        0
    }
}

fn normalize_value(value: &str) -> String {
    value.trim().to_lowercase()
}

fn get_business_record() -> Result<BusinessRecord, String> {
    let raw = get_storage_item(BUSINESS_STORAGE_KEY).ok_or(
        "Business setup not found. Complete setup before activating a licence.".to_string(),
    )?;
    serde_json::from_str(&raw).map_err(|_| "Could not read business details.".to_string())
}

fn add_valid_for(start: DateTime<Utc>, valid_for: &str) -> Result<DateTime<Utc>, String> {
    let parts: Vec<&str> = valid_for.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return Err("Invalid validity period in licence file.".to_string());
    }

    let amount: i64 = parts[0]
        .parse()
        .map_err(|_| "Invalid validity period in licence file.".to_string())?;
    if amount <= 0 {
        return Err("Validity period must be greater than zero.".to_string());
    }

    let unit = parts[1].trim_end_matches('s').to_lowercase();
    let duration = match unit.as_str() {
        "day" => chrono::Duration::days(amount),
        "month" => chrono::Duration::days(amount * 30),
        "year" => chrono::Duration::days(amount * 365),
        _ => {
            return Err(
                "Validity period must use days, months, or years (e.g. 18 Months).".to_string(),
            );
        }
    };

    Ok(start + duration)
}

fn parse_zip_license_json(text: &str) -> Result<ZipLicenseFile, String> {
    let trimmed = text.trim();
    if !trimmed.starts_with('{') {
        return Err(
            "Licence file must be JSON with Device ID, product, user e-mail, and Valid for."
                .to_string(),
        );
    }

    serde_json::from_str(trimmed)
        .map_err(|error| format!("Invalid licence JSON: {error}"))
}

fn validate_zip_license(file: &ZipLicenseFile) -> Result<StoredLicense, String> {
    let current_device_id = get_device_id();
    if normalize_value(&file.device_id) != normalize_value(&current_device_id) {
        return Err("Device ID does not match this computer.".to_string());
    }

    if !file.product.trim().eq_ignore_ascii_case(PRODUCT_NAME) {
        return Err(format!("Product must be {PRODUCT_NAME}."));
    }

    let business = get_business_record()?;
    if business.email.trim().is_empty() {
        return Err("Business email is not set. Add it in Settings first.".to_string());
    }

    if normalize_value(&file.user_email) != normalize_value(&business.email) {
        return Err("User e-mail does not match your business email in Settings.".to_string());
    }

    let now = Utc::now();
    let expires_at_dt = add_valid_for(now, &file.valid_for)?;
    let expires_at = expires_at_dt.format("%Y-%m-%d").to_string();
    let customer_name = if !business.business_name.trim().is_empty() {
        business.business_name.trim().to_string()
    } else {
        business.username.trim().to_string()
    };

    Ok(StoredLicense {
        device_id: current_device_id,
        product: PRODUCT_NAME.to_string(),
        email: business.email.trim().to_string(),
        valid_for: file.valid_for.trim().to_string(),
        expires_at,
        activated_at: now.to_rfc3339(),
        customer_name,
    })
}

fn stored_license_is_valid(stored: &StoredLicense, current_device_id: &str) -> Result<(), String> {
    if normalize_value(&stored.device_id) != normalize_value(current_device_id) {
        return Err("This licence is not valid for this device.".to_string());
    }

    if !stored.product.trim().eq_ignore_ascii_case(PRODUCT_NAME) {
        return Err("Invalid licence product.".to_string());
    }

    let business = get_business_record()?;
    if normalize_value(&stored.email) != normalize_value(&business.email) {
        return Err("Licence email does not match your business email.".to_string());
    }

    let expires_at: DateTime<Utc> = parse_expiry_date(&stored.expires_at)?;

    if expires_at < Utc::now() {
        return Err("Licence has expired. Please renew.".to_string());
    }

    Ok(())
}

/// One-time upgrade for devices that started a trial under the old 14-day policy.
/// Trial end is derived from start + TRIAL_DAYS, so anyone still inside that window
/// is extended automatically. Customers who were blocked after day 14 but are still
/// within 60 days of their original start need no data change. Anyone past the
/// 60-day window from their original start gets the unused portion of the 60-day
/// trial (counting up to 14 days already used).
pub fn migrate_trial_to_60_days() {
    if get_storage_item(TRIAL_MIGRATION_V60_KEY).is_some() {
        return;
    }
    set_storage_item(TRIAL_MIGRATION_V60_KEY, &Utc::now().to_rfc3339());

    if get_storage_item(LICENSE_STORAGE_KEY).is_some() {
        return;
    }
    if get_storage_item(TRIAL_USED_KEY).as_deref() != Some("true") {
        return;
    }
    let Some(start_raw) = get_storage_item(TRIAL_START_KEY) else {
        return;
    };
    let Ok(trial_start) = start_raw.parse::<DateTime<Utc>>() else {
        return;
    };

    let now = Utc::now();
    let extended_end = trial_start + chrono::Duration::days(TRIAL_DAYS);

    if now <= extended_end {
        // Still inside the 60-day window from the original start — TRIAL_DAYS handles it.
        return;
    }

    // Past the 60-day window but had used the old 14-day cap: credit those 14 days and
    // grant the remaining trial time from today.
    let credited_start = now - chrono::Duration::days(LEGACY_TRIAL_DAYS);
    set_storage_item(TRIAL_START_KEY, &credited_start.to_rfc3339());
}

fn status_from_stored_license(
    raw: &str,
    device_id: String,
    trial_used: bool,
) -> LicenseStatus {
    match serde_json::from_str::<StoredLicense>(raw) {
        Ok(stored) => match stored_license_is_valid(&stored, &device_id) {
            Ok(()) => LicenseStatus {
                licensed: true,
                trial: Some(false),
                device_id,
                trial_started_at: None,
                trial_ends_at: None,
                trial_used: Some(trial_used),
                days_remaining: Some(days_remaining(&stored.expires_at)),
                expires_at: Some(stored.expires_at),
                customer_name: if stored.customer_name.is_empty() {
                    None
                } else {
                    Some(stored.customer_name)
                },
                error: None,
            },
            Err(error) => LicenseStatus {
                licensed: false,
                trial: None,
                device_id,
                trial_started_at: None,
                trial_ends_at: None,
                trial_used: Some(trial_used),
                days_remaining: None,
                expires_at: None,
                customer_name: None,
                error: Some(error),
            },
        },
        Err(_) => LicenseStatus {
            licensed: false,
            trial: None,
            device_id,
            trial_started_at: None,
            trial_ends_at: None,
            trial_used: Some(trial_used),
            days_remaining: None,
            expires_at: None,
            customer_name: None,
            error: Some("Invalid stored licence data.".to_string()),
        },
    }
}

fn save_stored_license(stored: &StoredLicense) -> Result<(), String> {
    let json = serde_json::to_string(stored).map_err(|_| "Could not save licence.".to_string())?;
    set_storage_item(LICENSE_STORAGE_KEY, &json);
    Ok(())
}

fn zip_entry_meta(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    index: usize,
) -> Result<(bool, String), String> {
    let password = license_zip_password().as_bytes();
    // Password-protected licence ZIPs cannot use by_index() alone — that yields
    // "Password required to decrypt file" even when only listing entry names.
    if let Ok(file) = archive.by_index_decrypt(index, password) {
        return Ok((file.is_dir(), file.name().to_string()));
    }
    let file = archive.by_index(index).map_err(|error| {
        format!("Could not open ZIP entry (wrong password or unsupported encryption): {error}")
    })?;
    Ok((file.is_dir(), file.name().to_string()))
}

fn read_zip_text_entry(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    index: usize,
    name: &str,
) -> Result<String, String> {
    let password = license_zip_password().as_bytes();
    let mut content = String::new();
    if let Ok(mut file) = archive.by_index_decrypt(index, password) {
        file.read_to_string(&mut content)
            .map_err(|error| format!("Could not read {name}: {error}"))?;
        return Ok(content);
    }
    let mut file = archive
        .by_index(index)
        .map_err(|error| format!("Could not decrypt {name}: {error}"))?;
    file.read_to_string(&mut content)
        .map_err(|error| format!("Could not read {name}: {error}"))?;
    Ok(content)
}

pub fn extract_license_content_from_zip(zip_bytes: &[u8]) -> Result<String, String> {
    let cursor = Cursor::new(zip_bytes);
    let mut archive =
        ZipArchive::new(cursor).map_err(|error| format!("Invalid ZIP file: {error}"))?;

    let mut entries: Vec<(usize, String)> = Vec::new();
    for index in 0..archive.len() {
        let (is_dir, name) = zip_entry_meta(&mut archive, index)?;
        if is_dir {
            continue;
        }
        let lower = name.to_lowercase();
        if lower.ends_with(".txt") || lower.ends_with(".json") {
            entries.push((index, name));
        }
    }

    if entries.is_empty() {
        return Err("No licence file found in ZIP archive.".to_string());
    }

    entries.sort_by(|(a_index, a_name), (b_index, b_name)| {
        let rank = |name: &str| {
            let lower = name.to_lowercase();
            if lower.ends_with("license.json") {
                0
            } else if lower.ends_with("license.txt") {
                1
            } else if lower.ends_with(".json") {
                2
            } else {
                3
            }
        };
        rank(a_name)
            .cmp(&rank(b_name))
            .then_with(|| a_index.cmp(b_index))
    });

    for (index, name) in entries {
        let content = read_zip_text_entry(&mut archive, index, &name)?;
        if content.trim().starts_with('{') {
            return Ok(content);
        }
    }

    Err("No licence JSON file found in ZIP archive.".to_string())
}

fn activate_license_from_zip_bytes(zip_bytes: &[u8]) -> ActivateResult {
    match extract_license_content_from_zip(zip_bytes) {
        Ok(content) => match parse_zip_license_json(&content) {
            Ok(file) => match validate_zip_license(&file) {
                Ok(stored) => {
                    if let Err(error) = save_stored_license(&stored) {
                        return ActivateResult {
                            success: false,
                            error: Some(error),
                            expires_at: None,
                            customer_name: None,
                            days_remaining: None,
                        };
                    }
                    ActivateResult {
                        success: true,
                        error: None,
                        expires_at: Some(stored.expires_at.clone()),
                        customer_name: if stored.customer_name.is_empty() {
                            None
                        } else {
                            Some(stored.customer_name)
                        },
                        days_remaining: Some(days_remaining(&stored.expires_at)),
                    }
                }
                Err(error) => ActivateResult {
                    success: false,
                    error: Some(error),
                    expires_at: None,
                    customer_name: None,
                    days_remaining: None,
                },
            },
            Err(error) => ActivateResult {
                success: false,
                error: Some(error),
                expires_at: None,
                customer_name: None,
                days_remaining: None,
            },
        },
        Err(error) => ActivateResult {
            success: false,
            error: Some(error),
            expires_at: None,
            customer_name: None,
            days_remaining: None,
        },
    }
}

pub fn activate_license_from_zip_base64(zip_base64: &str) -> ActivateResult {
    let trimmed = zip_base64.trim();
    if trimmed.is_empty() {
        return ActivateResult {
            success: false,
            error: Some("Upload a licence ZIP file.".to_string()),
            expires_at: None,
            customer_name: None,
            days_remaining: None,
        };
    }

    let zip_bytes = STANDARD
        .decode(trimmed)
        .map_err(|_| "Could not read licence ZIP file.".to_string());

    match zip_bytes {
        Ok(bytes) => activate_license_from_zip_bytes(&bytes),
        Err(error) => ActivateResult {
            success: false,
            error: Some(error),
            expires_at: None,
            customer_name: None,
            days_remaining: None,
        },
    }
}

pub fn get_license_status() -> LicenseStatus {
    migrate_trial_to_60_days();
    let device_id = get_device_id();
    let license_key = get_storage_item(LICENSE_STORAGE_KEY);
    let trial_start_raw = get_storage_item(TRIAL_START_KEY);
    let trial_used = get_storage_item(TRIAL_USED_KEY).as_deref() == Some("true");

    if license_key.is_none() {
        if let Some(start_raw) = trial_start_raw {
            if let Ok(trial_start) = start_raw.parse::<DateTime<Utc>>() {
                let trial_end = trial_start + chrono::Duration::days(TRIAL_DAYS);
                let remaining =
                    ((trial_end - Utc::now()).num_seconds() as f64 / 86400.0).ceil() as i64;
                if remaining > 0 {
                    return LicenseStatus {
                        licensed: true,
                        trial: Some(true),
                        device_id,
                        trial_started_at: Some(trial_start.to_rfc3339()),
                        trial_ends_at: Some(trial_end.to_rfc3339()),
                        trial_used: Some(true),
                        days_remaining: Some(remaining),
                        expires_at: None,
                        customer_name: None,
                        error: None,
                    };
                }
            }
        }
    }

    if license_key.is_none() {
        return LicenseStatus {
            licensed: false,
            trial: None,
            device_id,
            trial_started_at: None,
            trial_ends_at: None,
            trial_used: Some(trial_used),
            days_remaining: None,
            expires_at: None,
            customer_name: None,
            error: if trial_used {
                Some("Free trial has ended. Please activate a license.".to_string())
            } else {
                None
            },
        };
    }

    if let Some(raw) = license_key {
        if raw.trim_start().starts_with('{') {
            return status_from_stored_license(&raw, device_id, trial_used);
        }

        return match verify_license_key(&raw, &device_id) {
        Ok(payload) => LicenseStatus {
            licensed: true,
            trial: Some(false),
            device_id,
            trial_started_at: None,
            trial_ends_at: None,
            trial_used: Some(trial_used),
            days_remaining: Some(days_remaining(&payload.expires_at)),
            expires_at: Some(payload.expires_at),
            customer_name: if payload.customer_name.is_empty() {
                None
            } else {
                Some(payload.customer_name)
            },
            error: None,
        },
        Err(error) => LicenseStatus {
            licensed: false,
            trial: None,
            device_id,
            trial_started_at: None,
            trial_ends_at: None,
            trial_used: Some(trial_used),
            days_remaining: None,
            expires_at: None,
            customer_name: None,
            error: Some(error),
        },
    };
    }

    LicenseStatus {
        licensed: false,
        trial: None,
        device_id,
        trial_started_at: None,
        trial_ends_at: None,
        trial_used: Some(trial_used),
        days_remaining: None,
        expires_at: None,
        customer_name: None,
        error: Some("No licence found.".to_string()),
    }
}

pub fn activate_license(license_key: &str) -> ActivateResult {
    let device_id = get_device_id();
    match verify_license_key(license_key, &device_id) {
        Ok(payload) => {
            set_storage_item(LICENSE_STORAGE_KEY, license_key.trim());
            ActivateResult {
                success: true,
                error: None,
                expires_at: Some(payload.expires_at.clone()),
                customer_name: if payload.customer_name.is_empty() {
                    None
                } else {
                    Some(payload.customer_name)
                },
                days_remaining: Some(days_remaining(&payload.expires_at)),
            }
        }
        Err(error) => ActivateResult {
            success: false,
            error: Some(error),
            expires_at: None,
            customer_name: None,
            days_remaining: None,
        },
    }
}

pub fn start_trial() -> TrialResult {
    let status = get_license_status();

    if status.trial == Some(true) && status.licensed {
        return TrialResult {
            success: true,
            already_started: Some(true),
            days_remaining: status.days_remaining,
            trial_ends_at: status.trial_ends_at,
            error: None,
        };
    }

    if status.trial_used == Some(true) {
        return TrialResult {
            success: false,
            error: Some("Free trial already used on this device.".to_string()),
            already_started: None,
            days_remaining: None,
            trial_ends_at: None,
        };
    }

    let now = Utc::now().to_rfc3339();
    set_storage_item(TRIAL_START_KEY, &now);
    set_storage_item(TRIAL_USED_KEY, "true");

    let next = get_license_status();
    TrialResult {
        success: true,
        already_started: Some(false),
        days_remaining: next.days_remaining,
        trial_ends_at: next.trial_ends_at,
        error: None,
    }
}

#[cfg(test)]
mod zip_extract_tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::{AesMode, ZipWriter};

    #[test]
    fn extracts_aes256_password_zip() {
        let password = license_zip_password();
        let json = r#"{
  "Device ID": "test-device",
  "product": "InvoraLite",
  "user e-mail": "a@b.com",
  "Vallid for": "18 Months"
}"#;

        let mut buffer = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut buffer);
            let options = SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .with_aes_encryption(AesMode::Aes256, password);
            writer.start_file("license.json", options).expect("start");
            writer.write_all(json.as_bytes()).expect("write");
            writer.finish().expect("finish");
        }

        let bytes = buffer.into_inner();
        let extracted = extract_license_content_from_zip(&bytes).expect("extract");
        assert!(extracted.contains("test-device"));
        assert!(extracted.contains("InvoraLite"));
    }
}
