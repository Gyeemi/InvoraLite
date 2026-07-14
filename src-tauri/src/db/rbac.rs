use serde::{Deserialize, Serialize};

use crate::db::errors::DbError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AppRole {
    Admin,
    Manager,
    #[serde(rename = "Store Keeper")]
    StoreKeeper,
    Cashier,
    Viewer,
}

impl AppRole {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "Admin" => Some(Self::Admin),
            "Manager" => Some(Self::Manager),
            "Store Keeper" => Some(Self::StoreKeeper),
            "Cashier" => Some(Self::Cashier),
            "Viewer" => Some(Self::Viewer),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Admin => "Admin",
            Self::Manager => "Manager",
            Self::StoreKeeper => "Store Keeper",
            Self::Cashier => "Cashier",
            Self::Viewer => "Viewer",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageContext {
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
}

impl StorageContext {
    pub fn role(&self) -> Option<AppRole> {
        self.role.as_deref().and_then(AppRole::parse)
    }

    pub fn username(&self) -> &str {
        self.username.as_deref().unwrap_or("")
    }
}

const SESSION_PREFIX: &str = "mentx_session:";
const SETUP_KEYS: &[&str] = &["mentx_business", "mentx_setup_complete"];
const PUBLIC_WRITE_KEYS: &[&str] = &[
    "invora_theme",
    "invora_profile_avatars",
    "invora_license_key",
    "invora_trial_start",
    "invora_trial_used",
    "invora_trial_migrated_v60",
];

fn is_session_key(key: &str) -> bool {
    key.starts_with(SESSION_PREFIX)
}

fn is_setup_key(key: &str) -> bool {
    SETUP_KEYS.contains(&key)
}

fn is_public_write_key(key: &str) -> bool {
    PUBLIC_WRITE_KEYS.contains(&key)
}

fn cashier_keys() -> &'static [&'static str] {
    &[
        "mentx_sales",
        "mentx_customers",
        "mentx_customer_payments",
        "mentx_e_payment_methods",
        "mentx_sales_returns",
    ]
}

fn store_keeper_keys() -> &'static [&'static str] {
    &[
        "mentx_products",
        "mentx_purchases",
        "mentx_suppliers",
        "mentx_supplier_payments",
        "mentx_product_categories",
        "mentx_offices",
        "mentx_office_expenses",
        "mentx_office_assets",
        "mentx_accounting_journal",
        "mentx_accounting_closes",
        "mentx_rate_masters",
        "mentx_product_offers",
        "mentx_quotations",
        "mentx_sales_returns",
        "mentx_purchase_returns",
    ]
}

fn business_only_keys() -> &'static [&'static str] {
    &["mentx_business"]
}

fn staff_keys() -> &'static [&'static str] {
    &["mentx_staff"]
}

pub fn authorize_read(_key: &str, _ctx: &StorageContext) -> Result<(), DbError> {
    Ok(())
}

pub fn authorize_write(key: &str, ctx: &StorageContext) -> Result<(), DbError> {
    if is_session_key(key) || is_public_write_key(key) {
        return Ok(());
    }

    // Setup keys are open before login; after login only Admin may rewrite business profile.
    if is_setup_key(key) {
        if key == "mentx_business" {
            if let Some(role) = ctx.role() {
                if role != AppRole::Admin {
                    return Err(DbError::Authorization(
                        "Only administrators can modify this data.".to_string(),
                    ));
                }
            }
        }
        return Ok(());
    }

    let Some(role) = ctx.role() else {
        return Err(DbError::Authorization(
            "Authentication is required for this operation.".to_string(),
        ));
    };

    if business_only_keys().contains(&key) {
        if role != AppRole::Admin {
            return Err(DbError::Authorization(
                "Only administrators can modify this data.".to_string(),
            ));
        }
        return Ok(());
    }

    if staff_keys().contains(&key) {
        if role == AppRole::Admin || role == AppRole::Manager {
            return Ok(());
        }
        return Err(DbError::Authorization(
            "Only administrators and managers can modify staff.".to_string(),
        ));
    }

    match role {
        AppRole::Admin | AppRole::Manager => Ok(()),
        AppRole::StoreKeeper => {
            if store_keeper_keys().contains(&key) || cashier_keys().contains(&key) {
                Ok(())
            } else {
                Err(DbError::Authorization(
                    "Store Keepers cannot modify this data.".to_string(),
                ))
            }
        }
        AppRole::Cashier => {
            if cashier_keys().contains(&key) {
                Ok(())
            } else {
                Err(DbError::Authorization(format!(
                    "{} cannot modify this data.",
                    role.as_str()
                )))
            }
        }
        AppRole::Viewer => Err(DbError::Authorization(format!(
            "{} has read-only access.",
            role.as_str()
        ))),
    }
}

pub fn authorize_remove(key: &str, ctx: &StorageContext) -> Result<(), DbError> {
    if is_session_key(key) {
        return Ok(());
    }

    let Some(role) = ctx.role() else {
        return Err(DbError::Authorization(
            "Authentication is required for this operation.".to_string(),
        ));
    };

    // Align with UI canDelete: Admin + Manager.
    if role != AppRole::Admin && role != AppRole::Manager {
        return Err(DbError::Authorization(
            "Only administrators and managers can delete stored data.".to_string(),
        ));
    }

    if business_only_keys().contains(&key) && role != AppRole::Admin {
        return Err(DbError::Authorization(
            "Only administrators can delete this data.".to_string(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn viewer_cannot_write_products() {
        let ctx = StorageContext {
            username: Some("viewer".to_string()),
            role: Some("Viewer".to_string()),
        };
        assert!(authorize_write("mentx_products", &ctx).is_err());
    }

    #[test]
    fn cashier_can_write_sales() {
        let ctx = StorageContext {
            username: Some("cashier".to_string()),
            role: Some("Cashier".to_string()),
        };
        assert!(authorize_write("mentx_sales", &ctx).is_ok());
    }

    #[test]
    fn only_admin_can_remove_storage_keys() {
        let keeper = StorageContext {
            username: Some("keeper".to_string()),
            role: Some("Store Keeper".to_string()),
        };
        assert!(authorize_remove("mentx_products", &keeper).is_err());

        let admin = StorageContext {
            username: Some("admin".to_string()),
            role: Some("Admin".to_string()),
        };
        assert!(authorize_remove("mentx_products", &admin).is_ok());
    }

    #[test]
    fn manager_can_write_products_sales_and_staff() {
        let ctx = StorageContext {
            username: Some("manager".to_string()),
            role: Some("Manager".to_string()),
        };
        assert!(authorize_write("mentx_products", &ctx).is_ok());
        assert!(authorize_write("mentx_sales", &ctx).is_ok());
        assert!(authorize_write("mentx_rate_masters", &ctx).is_ok());
        assert!(authorize_write("mentx_product_offers", &ctx).is_ok());
        assert!(authorize_write("mentx_quotations", &ctx).is_ok());
        assert!(authorize_write("mentx_staff", &ctx).is_ok());
        assert!(authorize_write("mentx_business", &ctx).is_err());
        assert!(authorize_remove("mentx_products", &ctx).is_ok());
        assert!(authorize_remove("mentx_business", &ctx).is_err());
    }

    #[test]
    fn manager_role_parses() {
        assert_eq!(AppRole::parse("Manager"), Some(AppRole::Manager));
        assert_eq!(AppRole::Manager.as_str(), "Manager");
    }
}
