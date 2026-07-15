# InvoraLite — Auto-updates via GitHub

Installed PCs can check GitHub Releases for a newer version, download a signed installer, and relaunch.

## What was wired

| Piece | Location |
|--------|----------|
| Tauri updater + process plugins | `src-tauri` Cargo + `lib.rs` |
| Public verify key + release endpoint | `src-tauri/tauri.conf.json` → `plugins.updater` |
| Updater artifacts on build | `bundle.createUpdaterArtifacts: true` |
| UI | **Manage** → *Software updates* |
| Private signing key (local) | `src-tauri/keys/invoralite.key` (gitignored) |
| Publish workflow | `.github/workflows/publish.yml` |

Endpoint used by the app:

`https://github.com/Gyeemi/InvoraLite/releases/latest/download/latest.json`

## One-time GitHub secrets

In the repo: **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|--------|--------|
| `TAURI_SIGNING_PRIVATE_KEY` | Full contents of `src-tauri/keys/invoralite.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Empty string if you used an empty password when generating |
| `INVORA_LICENSE_SECRET` | Same as `license/.env.local` (production licence HMAC) |
| `INVORA_LICENSE_ZIP_PASSWORD` | Same as `license/.env.local` (ZIP unlock password) |

Back up `invoralite.key` in a password manager. Losing it breaks the update chain for existing installs.

## Publish a new version

1. Bump version in **both**:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml` (`package.version`)
2. Commit and tag, e.g. `v1.0.1`.
3. Push the tag:
   ```powershell
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. Wait for **Publish** workflow → draft/release appears with installer + `latest.json`.
5. Publish the GitHub Release (if left as draft).

Clients on an older **signed** build open **Manage → Check for updates**.

## Local signed build

`npm run tauri:build` auto-loads `src-tauri\keys\invoralite.key` when present.

Without that key (or env vars), updater signing fails while `createUpdaterArtifacts` is enabled.

## Notes

- First install still needs the NSIS setup from Releases or `exports\`.
- Auto-update needs internet only for the check/download.
- Windows SmartScreen may still warn until you add Authenticode code signing (separate from updater minisign keys).
- Do not rotate `pubkey` in `tauri.conf.json` unless you accept that old installs cannot update.
