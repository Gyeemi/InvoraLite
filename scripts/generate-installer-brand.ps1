# Generates BMP assets for the InvoraLite NSIS installer (750x400 split mockup).
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\src-tauri\windows"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Save-Bmp($bitmap, $path) {
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bitmap.Dispose()
}

function Draw-GradientPanel($graphics, $x, $y, $w, $h) {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $indigo = [System.Drawing.Color]::FromArgb(255, 79, 70, 229)
    $teal = [System.Drawing.Color]::FromArgb(255, 13, 148, 136)

    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle $x, $y, $w, $h),
        $indigo,
        $teal,
        135
    )
    $graphics.FillRectangle($brush, $x, $y, $w, $h)
    $brush.Dispose()

    $swooshPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $swooshPath.AddEllipse([int]($x + $w * 0.3), [int]($y - $h * 0.35), [int]($w * 1.2), [int]($h * 1.1))
    $swooshBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($swooshPath)
    $swooshBrush.CenterColor = [System.Drawing.Color]::FromArgb(48, 255, 255, 255)
    $swooshBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
    $graphics.FillPath($swooshBrush, $swooshPath)
    $swooshBrush.Dispose()
    $swooshPath.Dispose()

    $cyan = [System.Drawing.Color]::FromArgb(70, 34, 211, 238)
    $arcPen1 = New-Object System.Drawing.Pen($cyan, 2.5)
    $arcPen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(45, 255, 255, 255), 2)
    $graphics.DrawArc($arcPen1, $x - 60, $y + 60, 520, 520, 195, 95)
    $graphics.DrawArc($arcPen2, $x - 30, $y + 100, 480, 480, 205, 75)
    $arcPen1.Dispose()
    $arcPen2.Dispose()
}

# Full installer body: white left + gradient right (750 x 400)
$totalW = 750
$totalH = 400
$leftW = 355
$rightW = $totalW - $leftW
$iconPath = Join-Path $outDir "..\icons\icon.ico"

$bg = New-Object System.Drawing.Bitmap $totalW, $totalH
$g = [System.Drawing.Graphics]::FromImage($bg)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::White)
Draw-GradientPanel $g $leftW 0 $rightW $totalH

# App icon on white left pane (matches mockup)
if (Test-Path $iconPath) {
    $icon = New-Object System.Drawing.Icon $iconPath
    $g.DrawIcon($icon, 40, 36)
    $icon.Dispose()
}

$g.Dispose()
Save-Bmp $bg (Join-Path $outDir "installer-bg-split.bmp")

# Standalone right panel (legacy)
$panel = New-Object System.Drawing.Bitmap $rightW, $totalH
$pg = [System.Drawing.Graphics]::FromImage($panel)
Draw-GradientPanel $pg 0 0 $rightW $totalH
$pg.Dispose()
Save-Bmp $panel (Join-Path $outDir "installer-panel-right.bmp")

if (Test-Path $iconPath) {
    $logo = New-Object System.Drawing.Bitmap 32, 32
    $lg = [System.Drawing.Graphics]::FromImage($logo)
    $lg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $icon = New-Object System.Drawing.Icon $iconPath
    $lg.DrawIcon($icon, 0, 0)
    $icon.Dispose()
    $lg.Dispose()
    Save-Bmp $logo (Join-Path $outDir "installer-logo.bmp")
}

Write-Host "Installer brand assets written to $outDir"
