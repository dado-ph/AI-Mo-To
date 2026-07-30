[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$EvidencePath,
  [string]$LauncherPath = (Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\aimoto.cmd")
)

$ErrorActionPreference = "Stop"
$evidenceFile = [System.IO.Path]::GetFullPath($EvidencePath)
New-Item -ItemType Directory -Path (Split-Path -Parent $evidenceFile) -Force | Out-Null
$windowsApps = [System.IO.Path]::GetFullPath(
  (Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps")
).TrimEnd("\")
$originalPath = $env:PATH
$pathEntries = @($originalPath -split [System.IO.Path]::PathSeparator |
  Where-Object { $_ -and ([System.IO.Path]::GetFullPath($_).TrimEnd("\") -ne $windowsApps) })
$effectivePath = $pathEntries -join [System.IO.Path]::PathSeparator
$resolved = $null
$resolution = $null
$output = @()
$exitCode = $null

try {
  # Model an agent host whose inherited PATH predates installation.
  $env:PATH = $effectivePath
  $discovered = Get-Command aimoto -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($discovered) {
    $resolved = $discovered.Source
    $resolution = "path"
  } elseif (Test-Path -LiteralPath $LauncherPath -PathType Leaf) {
    $resolved = (Resolve-Path -LiteralPath $LauncherPath).Path
    $resolution = "windowsAppsFallback"
  }
  if ($resolved) {
    $output = @(& $resolved --help 2>&1 | ForEach-Object { $_.ToString() })
    $exitCode = $LASTEXITCODE
  }
} finally {
  $env:PATH = $originalPath
}

$result = [ordered]@{
  schemaVersion = 1
  windowsAppsAbsentFromPath = -not (@($effectivePath -split [System.IO.Path]::PathSeparator) |
    Where-Object { $_ -and ([System.IO.Path]::GetFullPath($_).TrimEnd("\") -eq $windowsApps) })
  launcherPath = [System.IO.Path]::GetFullPath($LauncherPath)
  launcherExists = Test-Path -LiteralPath $LauncherPath -PathType Leaf
  resolution = $resolution
  resolvedPath = $resolved
  invoked = $null -ne $exitCode
  exitCode = $exitCode
  output = $output
}
$result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $evidenceFile -Encoding utf8

if (-not $result.launcherExists) { throw "The installed aimoto launcher is missing at '$LauncherPath'." }
if ($result.resolution -ne "windowsAppsFallback") { throw "The PATH-isolated check did not exercise the installed WindowsApps fallback." }
if (-not $result.invoked -or $result.exitCode -ne 0) { throw "The installed aimoto launcher did not successfully answer --help." }
Write-Output $evidenceFile
