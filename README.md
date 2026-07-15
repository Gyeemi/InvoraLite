# Invora Lite (Tauri)

Desktop inventory management app built with **Tauri 2**, **React**, **Vite**, and **TypeScript**. Replicates the Invora UI theme and core workflows from the Electron reference build.

## Features

- Dark Invora theme (sidebar navigation, cards, accent colors)
- License gate with 60-day trial and device-bound activation
- Business setup and sign-in
- Dashboard with sales chart and quick actions
- Products, Purchases, Customers/Suppliers, Analytics, Invoices, Settings
- Local SQLite storage via Rust backend
- Windows NSIS installer (`.exe` setup)

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install)
- Windows: [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 11)

## Development

```bash
npm install
npm run tauri:dev
```

On Windows, use `tauri:dev` (not `tauri dev`) so the MSVC linker (`link.exe`) is on PATH. A plain terminal does not load Visual Studio build tools automatically.

## Build installer (.exe)

```bash
npm install
npm run tauri:build
```

The installer is produced at:

`src-tauri/target/release/bundle/nsis/InvoraLite_v1.0.0_x64-setup.exe`

## License keys

See **[docs/LICENSE_ISSUANCE.md](docs/LICENSE_ISSUANCE.md)** for issuing real device-bound licences.

Production builds should set compile-time secrets (never commit them):

```powershell
$env:INVORA_LICENSE_SECRET = "<long-random-secret>"
$env:INVORA_LICENSE_ZIP_PASSWORD = "<strong-zip-password>"
npm run tauri:build
```

Pack a customer ZIP (same ZIP password as the build):

```powershell
npm run license:pack -- "<DEVICE-ID>" "customer@email.com" "18 Months"
```

Or issue an `INVORA-` HMAC key (same signing secret as the build):

```powershell
npm run license:issue-key -- "<DEVICE-ID>" "18 Months" "Customer Name"
```

## Auto-updates (GitHub Releases)

See **[docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md)**. Clients use **Manage → Software updates** after you publish a signed `v*` Release.


Dev builds without those env vars use placeholder secrets suitable only for local testing.

## Data location

SQLite database: `%APPDATA%\com.edp.invora\Invora\invora.db`

## Windows build tools

Building the `.exe` requires **Visual Studio Build Tools** with the **Desktop development with C++** workload (provides `link.exe`). Install from [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), then run `npm run tauri build` again.
