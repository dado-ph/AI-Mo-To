Add-Type -AssemblyName System.Drawing

$buildDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = [System.Drawing.Image]::FromFile((Join-Path $buildDirectory "..\..\..\docs\assets\aimoto-banner.png"))

function New-InstallerBitmap([string] $name, [int] $width, [int] $height, [bool] $sidebar) {
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#08090c"))

  $mint = [System.Drawing.ColorTranslator]::FromHtml("#71d7a5")
  $muted = [System.Drawing.ColorTranslator]::FromHtml("#9ba6b5")
  $mintBrush = New-Object System.Drawing.SolidBrush $mint
  $mutedBrush = New-Object System.Drawing.SolidBrush $muted

  if ($sidebar) {
    $graphics.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 113, 215, 165))), 0, 0, $width, 4)
    $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle 5, 27, 154, 193))
    $captionFont = New-Object System.Drawing.Font "Segoe UI", 7.5
    $graphics.DrawString("This is your AI.", $captionFont, $mintBrush, 17, 243)
    $graphics.DrawString("Local AI accelerated workspaces", $captionFont, $mutedBrush, 17, 257)
    $graphics.DrawString("for human-centered work.", $captionFont, $mutedBrush, 17, 270)
    $captionFont.Dispose()
  } else {
    $graphics.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 113, 215, 165))), 0, 0, $width, 3)
    $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle 104, 2, 42, 52))
    $titleFont = New-Object System.Drawing.Font "Segoe UI", 11, ([System.Drawing.FontStyle]::Bold)
    $captionFont = New-Object System.Drawing.Font "Segoe UI", 6.5
    $graphics.DrawString("AI-MO-TO", $titleFont, $mintBrush, 10, 11)
    $graphics.DrawString("Local-first workspace", $captionFont, $mutedBrush, 10, 32)
    $titleFont.Dispose()
    $captionFont.Dispose()
  }

  $mintBrush.Dispose()
  $mutedBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Save((Join-Path $buildDirectory $name), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bitmap.Dispose()
}

New-InstallerBitmap "installer-sidebar.bmp" 164 314 $true
New-InstallerBitmap "installer-header.bmp" 150 57 $false
$source.Dispose()
