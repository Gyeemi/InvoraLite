& (Join-Path $PSScriptRoot 'with-msvc.ps1') 'powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/generate-installer-brand.ps1'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $PSScriptRoot 'with-msvc.ps1') 'npm run tauri:icon'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $PSScriptRoot 'with-msvc.ps1') 'npx tauri build'
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    $root = Resolve-Path (Join-Path $PSScriptRoot '..')
    $tauriConfPath = Join-Path $root 'src-tauri\tauri.conf.json'
    $tauriConf = Get-Content $tauriConfPath -Raw | ConvertFrom-Json
    $productName = $tauriConf.productName
    $version = $tauriConf.version
    $bundleDir = Join-Path $root 'src-tauri\target\release\bundle\nsis'
    $exportsDir = Join-Path $root 'exports'
    $shellDir = Join-Path $root 'installer-shell'

    $exportDate = Get-Date -Format 'dd-MM-yyyy'
    $displayDate = Get-Date -Format 'dd|MM|yyyy'

    $innerDefault = Join-Path $bundleDir "${productName}_${version}_x64-setup.exe"
    $innerEmbeddedDir = Join-Path $shellDir 'embedded'
    $innerEmbedded = Join-Path $innerEmbeddedDir 'inner-setup.exe'

    New-Item -ItemType Directory -Force -Path $innerEmbeddedDir | Out-Null
    if (-not (Test-Path $innerDefault)) {
        Write-Warning "Inner NSIS installer not found at: $innerDefault"
        $exitCode = 1
    } else {
        Copy-Item $innerDefault $innerEmbedded -Force
        Copy-Item (Join-Path $root 'src-tauri\EULA.txt') (Join-Path $shellDir 'assets\EULA.txt') -Force
        Copy-Item (Join-Path $root 'src-tauri\icons\icon.ico') (Join-Path $shellDir 'assets\icon.ico') -Force
        Copy-Item (Join-Path $root 'src-tauri\icons\icon.ico') (Join-Path $shellDir 'icon.ico') -Force

        $iconPng = Join-Path $shellDir 'assets\icon.png'
        $iconSource = Join-Path $root 'src-tauri\icons\128x128@2x.png'
        if (-not (Test-Path $iconSource)) {
            $iconSource = Join-Path $root 'src-tauri\icons\icon.png'
        }
        if (Test-Path $iconSource) {
            Copy-Item $iconSource $iconPng -Force
        } else {
            Write-Warning "Installer logo PNG not found (run npm run tauri:icon from public/icon.svg)."
            $exitCode = 1
        }

        if ($exitCode -eq 0) {
        & (Join-Path $PSScriptRoot 'with-msvc.ps1') "cd /d `"$shellDir`" && cargo build --release"

        $shellExit = $LASTEXITCODE

        if ($shellExit -ne 0) {
            Write-Warning "HTML installer shell build failed."
            $exitCode = $shellExit
        } else {
            $shellExe = Join-Path $shellDir 'target\release\invora-installer.exe'
            $installerFileName = "${productName} v.${version} ${exportDate} x64-setup.exe"
            $exportCopy = Join-Path $exportsDir $installerFileName
            $bundleCopy = Join-Path $bundleDir $installerFileName

            New-Item -ItemType Directory -Force -Path $exportsDir | Out-Null
            Copy-Item $shellExe $exportCopy -Force
            Copy-Item $shellExe $bundleCopy -Force

            Write-Host ""
            Write-Host "InvoraLite desktop installer exported successfully."
            Write-Host "  Version:      v.$version"
            Write-Host "  Exported:     $displayDate"
            Write-Host "  UI:           HTML WebView2 (design mockup)"
            Write-Host "  Bundle:       $bundleCopy"
            Write-Host "  Export copy:  $exportCopy"
        }
        }
    }
}

exit $exitCode
