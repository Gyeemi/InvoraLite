# Issuer helper — RUN this in PowerShell from the InvoraLite project root.
# Do NOT upload this .ps1 (or a ZIP of it) into the app.
# The app only accepts the packed licence ZIP produced by license:pack
# (password-protected, contains license.json).

param(
    [Parameter(Mandatory = $true)]
    [string]$DeviceId,

    [Parameter(Mandatory = $true)]
    [string]$Email,

    [string]$ValidFor = "18 Months"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Strip accidental <...> wrappers from docs/examples
$DeviceId = $DeviceId.Trim().Trim("<").Trim(">")
$Email = $Email.Trim()

$envFile = Join-Path $root "license\.env.local"
if (-not (Test-Path $envFile)) {
    throw "Missing license\.env.local — create secrets first (see docs\LICENSE_ISSUANCE.md)."
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_.Split('=', 2)
    Set-Item -Path "env:$k" -Value $v.Trim().Trim('"').Trim("'")
}

npm run license:pack -- $DeviceId $Email $ValidFor

Write-Host ""
Write-Host "Upload this file in InvoraLite (Manage Licence):"
Write-Host "  $(Join-Path $root 'license\invora-license.zip')"
Write-Host "Do not upload Invora-License.ps1 or a ZIP that only contains this script."
