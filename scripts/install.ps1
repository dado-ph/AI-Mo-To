[CmdletBinding()]
param(
  [switch] $UseLocalBuild
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# 1. Detect existing installation across Registry, default AppData, or PATH
$installedPath = $null
$regInstallPath = Get-ItemPropertyValue -Path "HKCU:\Software\AI-Mo-To" -Name "InstallPath" -ErrorAction SilentlyContinue
if ($regInstallPath -and (Test-Path -LiteralPath (Join-Path $regInstallPath "AI-Mo-To.exe"))) {
  $installedPath = Join-Path $regInstallPath "AI-Mo-To.exe"
} else {
  $defaultExe = Join-Path $env:LOCALAPPDATA "Programs\AI-Mo-To\AI-Mo-To.exe"
  if (Test-Path -LiteralPath $defaultExe) {
    $installedPath = $defaultExe
  }
}

$isUpdate = [bool]$installedPath
$oldVersion = "unknown"
if ($isUpdate) {
  try {
    $versionInfo = (Get-Item -LiteralPath $installedPath).VersionInfo
    if ($versionInfo.ProductVersion) { $oldVersion = $versionInfo.ProductVersion }
    elseif ($versionInfo.FileVersion) { $oldVersion = $versionInfo.FileVersion }
  } catch {}
  Write-Host "[AI-Mo-To] Detected existing installation (v$oldVersion) at: $(Split-Path -Parent $installedPath)"
}

# 2. Acquire installer artifact (GitHub CDN by default, or local build if requested)
$installerPath = $null
$isLocalBuild = $false

if ($UseLocalBuild) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $repoReleaseDir = Join-Path (Split-Path -Parent $scriptDir) "apps\desktop\release"
  $localInstaller = Get-ChildItem -Path $repoReleaseDir -Filter "AI-Mo-To-Setup-*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($localInstaller -and (Test-Path -LiteralPath $localInstaller.FullName)) {
    Write-Host "[AI-Mo-To] Using local release installer artifact: $($localInstaller.Name)"
    $installerPath = $localInstaller.FullName
    $isLocalBuild = $true
  } else {
    Write-Warning "Local build installer requested (-UseLocalBuild), but no AI-Mo-To-Setup-*.exe artifact was found in $repoReleaseDir."
  }
}

if (-not $installerPath) {
  Write-Host "[AI-Mo-To] Fetching latest release from GitHub CDN (dado-ph/AI-Mo-To)..."
  $downloadUrl = $null
  $assetName = $null

  try {
    $release = Invoke-RestMethod `
      -Headers @{ Accept = "application/vnd.github+json"; "User-Agent" = "AI-Mo-To-Installer" } `
      -Uri "https://api.github.com/repos/dado-ph/AI-Mo-To/releases/latest"
    $asset = $release.assets |
      Where-Object { $_.name -match '^AI-Mo-To-Setup-.*-x64\.exe$' } |
      Select-Object -First 1

    if ($asset) {
      $downloadUrl = $asset.browser_download_url
      $assetName = $asset.name
    }
  } catch {
    Write-Host "[AI-Mo-To] GitHub API lookup un-available; attempting direct release CDN download..."
  }

  if (-not $downloadUrl) {
    $assetName = "AI-Mo-To-Setup-x64.exe"
    $downloadUrl = "https://github.com/dado-ph/AI-Mo-To/releases/latest/download/AI-Mo-To-Setup-0.1.0-x64.exe"
  }

  $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) $assetName
  Write-Host "[AI-Mo-To] Downloading from GitHub CDN: $downloadUrl..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $tempPath -UserAgent "AI-Mo-To-Installer"
  $installerPath = $tempPath
}

if (-not $installerPath -or -not (Test-Path -LiteralPath $installerPath)) {
  throw "The AI-Mo-To installer could not be downloaded from GitHub CDN."
}

# 3. Stop running AI-Mo-To processes before applying update (prevents file lock issues)
$runningProcesses = Get-Process -Name "AI-Mo-To*" -ErrorAction SilentlyContinue
if ($runningProcesses) {
  Write-Host "[AI-Mo-To] Closing running AI-Mo-To instances for update..."
  $runningProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}

# 4. Perform silent installation / upgrade
try {
  if ($isUpdate) {
    Write-Host "[AI-Mo-To] Performing in-place upgrade..."
  } else {
    Write-Host "[AI-Mo-To] Installing AI-Mo-To..."
  }
  $process = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "The AI-Mo-To installer exited with code $($process.ExitCode)."
  }
} finally {
  if (-not $isLocalBuild -and (Test-Path -LiteralPath $installerPath)) {
    Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
  }
}

# 5. Verify launcher and refresh active shell PATH
$windowsAppsDir = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps"
$launcher = Join-Path $windowsAppsDir "aimoto.cmd"
if (-not (Test-Path -LiteralPath $launcher)) {
  throw "AI-Mo-To installed, but its aimoto command launcher was not created."
}

if ($env:PATH -notlike "*$windowsAppsDir*") {
  $env:PATH = "$windowsAppsDir;$env:PATH"
}

# 6. Output clear success status
if ($isUpdate) {
  Write-Host "[AI-Mo-To] Successfully updated AI-Mo-To!" -ForegroundColor Green
} else {
  Write-Host "[AI-Mo-To] Successfully installed AI-Mo-To!" -ForegroundColor Green
}
Write-Host "Open a new terminal (or use current shell) and run: aimoto --help"
