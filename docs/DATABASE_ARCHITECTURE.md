# InvoraLite Database Architecture

This document describes the secure SQLite data layer introduced for InvoraLite (Tauri 2 + React). All database access is centralized in the Rust backend; the UI never talks to SQLite directly.

## Security issues addressed

| Issue (before) | Risk | Mitigation |
|----------------|------|------------|
| SQLite opened from scattered helpers | Hard to audit, easy to bypass validation | Single `DatabaseManager` in `src-tauri/src/db/manager.rs` |
| JSON blobs in `app_storage` with minimal checks | Oversized/malicious payloads, weak integrity | Key/value validation, size limits, parameterized SQL |
| Storage writes without auth context | Any session could mutate business data | RBAC on `storage_set` / `storage_remove` via `StorageContext` |
| Passwords stored as plaintext (legacy) | Credential theft from DB file | Argon2id hashing + migration on login |
| No account lockout | Brute-force login attempts | `auth_lockout` table, 5 failures → 15 min lock |
| DB under `%APPDATA%` install-adjacent path | Permissions / backup confusion | `%LOCALAPPDATA%/InvoraLite/invora.db` with legacy migration |
| Errors could expose internals | Information disclosure | `StorageResult` returns friendly messages; details logged server-side |
| No audit trail | No accountability for changes | `audit_log` table + login/logout/inventory events |
| No startup health checks | Silent corruption | `integrity_check`, schema version, `foreign_keys` on init |
| No encryption at rest | DB file readable if copied from disk | AES-256-GCM vault (`invora.db.vault`) + Windows DPAPI key |

**Note:** Domain entities (products, sales, staff) remain JSON documents in `app_storage` for backward compatibility. Relational tables and entity-level foreign keys are a future migration; the current layer secures *access* to that model without breaking existing installs.

## Folder structure

```
src-tauri/src/
├── database.rs          # Thin facade re-exporting DatabaseManager helpers
├── backup.rs            # Export/restore ZIP wrappers (delegates to manager)
├── lib.rs               # Tauri commands (storage, audit, auth, health)
└── db/
    ├── mod.rs
    ├── manager.rs       # DatabaseManager — connection, transactions, backups
    ├── storage_repository.rs  # Parameterized CRUD on app_storage
    ├── schema.rs        # Tables: app_storage, audit_log, auth_lockout, schema_meta
    ├── validation.rs    # Input validation (keys, values, lengths)
    ├── sql_guard.rs     # Rejects dangerous SQL keywords in identifiers
    ├── rbac.rs          # Role-based write/delete authorization
    ├── auth_security.rs # Login lockout
    ├── audit_repo.rs    # Audit log inserts
    ├── health.rs        # Startup / on-demand health reports
    ├── config.rs        # Paths (data dir, vault file, backups)
    ├── encryption_key.rs # AES-256-GCM vault seal/unseal + Windows DPAPI key storage
    ├── errors.rs        # DbError + user-safe StorageResult
    └── integration_tests.rs

src/lib/
├── storage.ts           # Frontend storage API (passes StorageContext)
├── audit.ts             # Audit + lockout Tauri commands
├── database.ts          # database_health command wrapper
└── passwordPolicy.ts    # Shared password complexity rules
```

## Database location

| Path | Purpose |
|------|---------|
| `%LOCALAPPDATA%/InvoraLite/invora.db` | Live database (decrypted while app is running) |
| `%LOCALAPPDATA%/InvoraLite/invora.db.vault` | Encrypted database at rest (when app is closed) |
| `%LOCALAPPDATA%/InvoraLite/.dbkey` | DPAPI-protected AES key (Windows user scope) |
| `%LOCALAPPDATA%/InvoraLite/backups/` | Automatic timestamped ZIP backups (last 10 kept) |
| Legacy: `%APPDATA%/.../Invora/invora.db` | Migrated once on first launch if new path is empty |

## Data flow

```
React UI / data.ts
    → storage.ts (adds StorageContext: username, role)
        → Tauri: storage_get | storage_set | storage_remove
            → DatabaseManager
                → validation + sql_guard
                → rbac (writes/deletes)
                → storage_repository (parameterized SQL)
                → audit_repo (sensitive keys)
```

License and internal Rust modules use `get_storage_item` / `set_storage_item` on the facade; those route through `DatabaseManager` with an empty context (allowed for setup/license keys only).

## SQL security rules

- **All** queries use `?` placeholders via `rusqlite::params!`.
- Storage **keys** are validated with `assert_safe_identifier` (rejects `DROP`, `ALTER`, `PRAGMA`, etc.).
- Storage **values** are capped at 50 MB.
- Schema DDL runs only from static strings in `schema.rs` at initialization — never from user input.

## Role-based access control

Roles map to application roles: **Admin**, **Store Keeper** (Manager), **Cashier**, **Staff (Viewer)**.

| Role | Write access |
|------|----------------|
| Unauthenticated | Setup keys, license keys, theme, avatars, sessions |
| Viewer | Read-only (sessions/theme/avatars only) |
| Cashier | Sales, customers, customer payments, payment methods |
| Store Keeper | Cashier keys + products, purchases, suppliers, offices, accounting |
| Admin | All keys including `mentx_staff`, `mentx_business` |

**Deletes:** Only **Admin** may call `storage_remove` (except session keys).

Frontend must call `setStorageContext({ username, role })` after login (`AuthContext` does this).

## Transactions

`DatabaseManager::with_transaction` wraps operations in `BEGIN` / `COMMIT` and rolls back on any `Err`.  
`set_storage` and `remove_storage` use transactions so storage updates and audit rows stay consistent.

## Authentication

- **Hashing:** Argon2id via `password_hash` command (`src-tauri/src/password.rs`).
- **Complexity (new passwords):** min 8 chars, at least one letter and one number.
- **Legacy plaintext:** Verified once, re-hashed on successful login.
- **Lockout:** 5 failed attempts → 15 minutes (`auth_record_failed_login`, `auth_lockout_status`).
- **Session timeout:** 30 minutes idle (`AuthContext`).

Passwords are never written to `audit_log`.

## Backups

1. **Automatic:** On each app start, a consistent snapshot is zipped to `backups/invora_backup_YYYYMMDD_HHMMSS.zip`.
2. **Manual export:** Settings → `database_export` → same ZIP format with `manifest.json`.
3. **Restore:** `database_restore` extracts `invora.db`, swaps files with rollback on failure, restarts app.
4. **Integrity:** Each backup ZIP is verified to contain `invora.db` and a valid manifest.

## Health checks

On startup, `DatabaseManager::initialize` runs:

- `PRAGMA foreign_keys` (must be ON)
- `PRAGMA integrity_check` (must return `ok`)
- Required tables + `schema_meta.version`

Frontend calls `database_health` on load (`App.tsx`); unhealthy state is logged to the console.

## Database encryption (AES vault)

InvoraLite encrypts the database **at rest** using a whole-file vault (pure Rust — no OpenSSL/Perl build dependencies):

- While the app runs, SQLite uses a decrypted `invora.db` in `%LOCALAPPDATA%/InvoraLite/`.
- On **clean exit**, the app checkpoints WAL, encrypts the file with **AES-256-GCM**, writes `invora.db.vault`, and removes the plaintext `invora.db` (and `-wal`/`-shm` journals).
- On **startup**, if only the vault exists, it is decrypted back to `invora.db` before opening SQLite.
- The 256-bit key is stored in `%LOCALAPPDATA%/InvoraLite/.dbkey`, protected with **Windows DPAPI** (bound to the Windows user account).
- Keys are **never** hardcoded in source or embedded in the app binary.
- Manual backups export a consistent **plaintext** snapshot inside the ZIP (for disaster recovery); protect backup files accordingly.
- Health checks require encryption to be configured (`encryption_enabled` in `database_health`).

**Limitations (honest security model):**

- While the app is open after unseal, `invora.db` exists decrypted on disk (same class of risk as SQLCipher without per-page encryption during runtime).
- If the app crashes or is killed, plaintext may remain. On the **next launch**, InvoraLite refreshes `invora.db.vault` from that plaintext so the sealed copy is not stale, then continues.
- **Logout / session timeout** seals at rest (`database_seal_at_rest`); the next login / start calls `database_ensure_open`.
- DPAPI protects the key for the logged-in Windows user; a fully compromised machine while the user is logged in may still expose data.
- Vault backups are **not** portable to another Windows user profile without re-exporting data through the app.

SQLCipher was evaluated but not used on Windows due to OpenSSL/Perl toolchain requirements during build.

## Adding a new storage key

1. Add the key constant in `src/lib/storage.ts` (`STORAGE_KEYS`).
2. Add RBAC rules in `src-tauri/src/db/rbac.rs` (cashier / store keeper / admin lists).
3. Optionally map audit action in `audit_repo.rs` → `map_storage_key_to_action`.
4. Use `storageSet` / `storageGet` from the frontend — never add raw SQL elsewhere.
5. Add tests in `db/integration_tests.rs` if the key has special permission rules.

## Tauri commands (database-related)

| Command | Purpose |
|---------|---------|
| `storage_get` | Read key (optional `StorageContext`) |
| `storage_set` | Upsert key (RBAC + audit) |
| `storage_remove` | Delete key (Admin only, except sessions) |
| `database_health` | Health report |
| `database_seal_at_rest` | Checkpoint, seal vault, remove plaintext (logout) |
| `database_ensure_open` | Unseal + reopen connection |
| `database_refresh_vault` | Refresh vault from live DB without closing session |
| `audit_record` | Explicit audit entry |
| `auth_lockout_status` | Check lockout |
| `auth_record_failed_login` | Increment failures |
| `auth_clear_lockout` | Clear on successful login |
| `database_export` / `database_restore` | Manual backup/restore |
| `password_hash` / `password_verify` | Credential handling |

## Tests

**Rust** (`cargo test` in `src-tauri`):

- SQL injection key rejection
- RBAC (viewer, cashier, admin delete)
- Transaction rollback
- Lockout after repeated failures
- Integrity check on fresh DB
- Password hash / legacy migration

**Frontend** (`npm test`):

- `passwordPolicy.test.ts` — complexity rules
- Existing `data.test.ts`, `constants.test.ts`

## Operational notes

- Free disk space is required under `%LOCALAPPDATA%` for DB and backups.
- If corruption is detected, restore from the latest file in `backups/` or a manual export.
- Do not place `invora.db` in Program Files or the application install directory.
