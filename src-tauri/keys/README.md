# Updater signing keys

- `invoralite.key` — **private**. Gitignored. Required to sign installers for auto-update.
- `invoralite.key.pub` — public counterpart embedded in `tauri.conf.json` (`plugins.updater.pubkey`).

If you lose the private key, existing installs cannot verify new updates signed with a replacement key.

See `docs/AUTO_UPDATE.md`.
