$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$release = Invoke-RestMethod `
  -Headers @{ Accept = "application/vnd.github+json"; "User-Agent" = "AI-Mo-To-Installer" } `
  -Uri "https://api.github.com/repos/dado-ph/AI-Mo-To/releases/latest"
$asset = $release.assets |
  Where-Object { $_.name -match '^AI-Mo-To-Setup-.*-x64\.exe$' } |
  Select-Object -First 1

if (-not $asset) {
  throw "The latest AI-Mo-To release does not contain a Windows x64 installer."
}

$installer = Join-Path ([System.IO.Path]::GetTempPath()) $asset.name
try {
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer
  $process = Start-Process -FilePath $installer -ArgumentList "/S" -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "The AI-Mo-To installer exited with code $($process.ExitCode)."
  }
} finally {
  Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
}

$launcher = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\aimoto.cmd"
if (-not (Test-Path -LiteralPath $launcher)) {
  throw "AI-Mo-To installed, but its aimoto command launcher was not created."
}

Write-Host "AI-Mo-To is installed. Open a new PowerShell window, then run: aimoto --help"
