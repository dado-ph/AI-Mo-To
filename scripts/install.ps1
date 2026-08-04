$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$useLocalBuild = $env:AI_MO_TO_USE_LOCAL_BUILD -eq "1"

function Write-InstallerBanner {
  Write-Host ""
  Write-Host "  +--------------------------------------------------------+" -ForegroundColor DarkCyan
  Write-Host "  |                  A I - M O - T O                     |" -ForegroundColor Cyan
  Write-Host "  |       Local workspaces. Human-approved changes.       |" -ForegroundColor DarkGray
  Write-Host "  +--------------------------------------------------------+" -ForegroundColor DarkCyan
  Write-Host ""
}

function Select-ReleaseChannel {
  $requestedReleaseChannel = [string]$env:AI_MO_TO_RELEASE_CHANNEL
  if ($requestedReleaseChannel) {
    if ($requestedReleaseChannel -notin @("Stable", "Prerelease")) {
      throw "AI_MO_TO_RELEASE_CHANNEL must be Stable or Prerelease."
    }
    return $requestedReleaseChannel
  }

  Write-Host "  Choose the release channel:" -ForegroundColor White
  Write-Host "    [1] Latest stable release     Recommended for everyday use" -ForegroundColor Green
  Write-Host "    [2] Latest prerelease         Early testing build" -ForegroundColor Yellow
  $selection = Read-Host "  Enter 1 or 2 (default: 1)"

  switch ($selection) {
    "" { return "Stable" }
    "1" { return "Stable" }
    "2" { return "Prerelease" }
    default { throw "Choose 1 for the latest stable release or 2 for the latest prerelease." }
  }
}

Write-InstallerBanner
$selectedReleaseChannel = if ($useLocalBuild) { "Local build" } else { Select-ReleaseChannel }
Write-Host "[AI-Mo-To] Release channel: $selectedReleaseChannel" -ForegroundColor Cyan

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

if ($useLocalBuild) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $repoReleaseDir = Join-Path (Split-Path -Parent $scriptDir) "apps\desktop\release"
  $localInstaller = Get-ChildItem -Path $repoReleaseDir -Filter "AI-Mo-To-Setup-*-x64.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 1MB } |
    Sort-Object -Property LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if ($localInstaller -and (Test-Path -LiteralPath $localInstaller.FullName)) {
    Write-Host "[AI-Mo-To] Using local release installer artifact: $($localInstaller.Name)"
    $installerPath = $localInstaller.FullName
    $isLocalBuild = $true
  } else {
    Write-Warning "Local build installer requested (-UseLocalBuild), but no AI-Mo-To-Setup-*.exe artifact was found in $repoReleaseDir."
  }
}

if (-not $installerPath) {
  Write-Host "[AI-Mo-To] Fetching the latest $($selectedReleaseChannel.ToLowerInvariant()) release from GitHub CDN (dado-ph/AI-Mo-To)..."
  $downloadUrl = $null
  $assetName = $null

  try {
    $headers = @{ Accept = "application/vnd.github+json"; "User-Agent" = "AI-Mo-To-Installer" }
    if ($selectedReleaseChannel -eq "Prerelease") {
      $release = $null
      $publishedReleases = @(Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/dado-ph/AI-Mo-To/releases?per_page=100")
      foreach ($candidateRelease in $publishedReleases) {
        if ($candidateRelease.prerelease -eq $true -and $candidateRelease.draft -ne $true) {
          $release = $candidateRelease
          break
        }
      }
    } else {
      $release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/dado-ph/AI-Mo-To/releases/latest"
    }

    if (-not $release) {
      throw "No published $($selectedReleaseChannel.ToLowerInvariant()) release was found."
    }

    $asset = $release.assets |
      Where-Object { $_.name -match '^AI-Mo-To-Setup-.*-x64\.exe$' } |
      Select-Object -First 1

    if ($asset) {
      $downloadUrl = $asset.browser_download_url
      $assetName = $asset.name
    }
  } catch {
    throw "Could not retrieve the latest $($selectedReleaseChannel.ToLowerInvariant()) release from GitHub. $($_.Exception.Message)"
  }

  if (-not $downloadUrl) {
    throw "Could not locate an AI-Mo-To x64 installer in the latest $($selectedReleaseChannel.ToLowerInvariant()) GitHub release. Check the release assets or run this script from a checkout with -UseLocalBuild."
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
