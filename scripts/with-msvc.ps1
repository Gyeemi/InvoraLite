param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Command
)

$ErrorActionPreference = 'Stop'

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) {
    Write-Error 'vswhere.exe not found. Install Visual Studio Build Tools with Desktop development with C++.'
    exit 1
}

$vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsPath) {
    Write-Error 'MSVC build tools not found. Install Visual Studio Build Tools with the C++ workload (link.exe).'
    exit 1
}

$vcvars = Join-Path $vsPath 'VC\Auxiliary\Build\vcvars64.bat'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

cmd /c "`"$vcvars`" >nul && cd /d `"$root`" && $Command"
exit $LASTEXITCODE
