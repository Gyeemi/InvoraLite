# InvoraLite — Issuing real licenses

InvoraLite supports two activation methods. Both are **device-bound**.

| Method | What the customer gets | How it is secured |
|--------|------------------------|-------------------|
| **Licence ZIP** (UI default) | Password-protected `invora-license.zip` | AES ZIP password embedded in the production app build |
| **INVORA- key** (optional/API) | String like `INVORA-<payload>-<hmac>` | HMAC-SHA256 with a production signing secret |

## 1. Create production secrets (once)

Generate long random values (do **not** commit them):

```powershell
# PowerShell — save these somewhere safe (password manager / private vault)
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

Create a **private** local file (already gitignored patterns cover `.env`):

`license/.env.local`

```env
INVORA_LICENSE_SECRET=paste-your-48+-char-secret-here
INVORA_LICENSE_ZIP_PASSWORD=paste-another-strong-password-here
```

Use the **same** values every time you:

1. Build a production installer for customers  
2. Pack a licence ZIP  
3. Issue an `INVORA-` key  

If you change the secret later, **old licence keys stop verifying**. ZIP passwords must match the password baked into that installer build.

## 2. Build a production installer with those secrets

From the project root (Windows, PowerShell):

```powershell
$env:INVORA_LICENSE_SECRET = "<your-secret>"
$env:INVORA_LICENSE_ZIP_PASSWORD = "<your-zip-password>"
npm run tauri:build
```

The release binary embeds these values at compile time. Dev builds without env vars keep safe placeholder defaults (fine for local testing only).

## 3. Collect customer details

On the customer's PC, InvoraLite shows **Device ID** on the licence screen.

You also need:

- Their **business email** (must match Setup / Settings email for ZIP activation)
- Validity period, e.g. `"18 Months"`, `"1 Year"`, `"90 Days"`

## 4. Issue a licence ZIP (recommended)

```powershell
# Load secrets (or set $env:… as above)
Get-Content license/.env.local | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k,$v = $_.Split('=',2); Set-Item -Path "env:$k" -Value $v.Trim()
}

npm run license:pack -- "DEVICE-ID-HERE" "customer@email.com" "18 Months"
```

Do **not** wrap the Device ID in `< >` — paste the UUID only.

Output: `license/invora-license.zip`  
Send that file to the customer. They activate via **Upload licence ZIP** in InvoraLite.  

The customer must run an installer built with the **same** `INVORA_LICENSE_ZIP_PASSWORD` as used when packing.

## 5. Issue an INVORA- key (optional)

```powershell
npm run license:issue-key -- "<DEVICE-ID>" "18 Months" "Customer Name"
```

Gives a single-line `INVORA-…` key verified with the same `INVORA_LICENSE_SECRET`.

## Checklist before selling licenses

- [x] Secrets rotated into `license/.env.local` (not committed)  
- [x] Production installer built **with** those env vars (`npm run tauri:build` loads `.env.local`)  
- [x] Pack/issue tools use the **same** env vars (load `.env.local` before packing)  
- [ ] Prefer a **private** GitHub repo (or keep secrets only on your build PC)  
- [x] Never commit `license/.env.local`, secrets, or customer licence ZIPs (gitignored) 

## Operational tips

- One Device ID → one machine. Changing hardware may require a re-issue.  
- ZIP activation also checks product name `InvoraLite` and matching business email.  
- Trial remains available for unlicensed installs (60 days) unless already used.  
