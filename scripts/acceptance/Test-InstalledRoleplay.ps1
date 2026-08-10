[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RunRoot,
  [switch]$SkipRepositoryCheck
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath $RunRoot).Path
$evidenceRoot = Join-Path $root "evidence"
$failures = [System.Collections.Generic.List[string]]::new()

function Require([bool]$condition, [string]$message) {
  if (-not $condition) { $failures.Add($message) }
}
function Read-Json([string]$relative) {
  $path = Join-Path $evidenceRoot $relative
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Require $false "Missing evidence/$relative."
    return $null
  }
  try { return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
  catch { Require $false "evidence/$relative is not valid JSON."; return $null }
}
function Evidence-Data($value) {
  if ($null -ne $value -and $null -ne $value.data) { return $value.data }
  return $value
}
function Get-Sha256([string]$path) {
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($hasher.ComputeHash([System.IO.File]::ReadAllBytes($path))) -replace "-", "").ToLowerInvariant()
  } finally { $hasher.Dispose() }
}
function Versions($value) {
  $body = Evidence-Data $value
  if ($null -eq $body -or $null -eq $body.versions) { return @() }
  return @($body.versions)
}
function Version($value) {
  $body = Evidence-Data $value
  if ($null -ne $body.version) { return $body.version }
  return $body
}
function File-Map($value) {
  $map = @{}
  $body = Evidence-Data $value
  foreach ($file in @($body.files)) {
    if ($null -ne $file -and -not [string]::IsNullOrWhiteSpace([string]$file.path)) {
      $map[[string]$file.path] = [string]$file.sha256
    }
  }
  return $map
}

$manifest = Read-Json "manifest.json"
if ($null -eq $manifest) { exit 1 }
Require ($manifest.schemaVersion -eq 3) "Unsupported evidence schema; semantic evidence version 3 is required."
Require (-not ([string]$manifest.isolationRoot).StartsWith([string]$manifest.repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) "Run is inside the repository."
Require (([System.IO.Path]::GetFullPath([string]$manifest.workspaceRoot)).StartsWith(([System.IO.Path]::GetFullPath([string]$manifest.isolationRoot)), [System.StringComparison]::OrdinalIgnoreCase)) "Workspace is not inside the fresh isolation root."
Require (Test-Path -LiteralPath $manifest.artifact.path -PathType Leaf) "Recorded installer artifact is missing."
if (Test-Path -LiteralPath $manifest.artifact.path -PathType Leaf) {
  Require ((Get-Sha256 $manifest.artifact.path) -eq $manifest.artifact.sha256) "Installer artifact digest changed."
}

$installResult = Read-Json "install/result.json"
$pathResilience = Read-Json "install/path-resilience.json"
if ($installResult) {
  $install = Evidence-Data $installResult
  Require ($install.exitCode -eq 0 -or $install.installed -eq $true) "Recorded one-line installation did not succeed."
  Require (-not [string]::IsNullOrWhiteSpace([string]$install.command)) "Installation evidence has no one-line PowerShell command."
  Require (([string]$install.command -split "(`r`n|`n|`r)").Count -eq 1) "Installation command is not one line."
}
if ($pathResilience) {
  Require ($pathResilience.windowsAppsAbsentFromPath -eq $true) "PATH-resilience evidence did not remove WindowsApps."
  Require ($pathResilience.launcherExists -eq $true -and $pathResilience.invoked -eq $true -and $pathResilience.exitCode -eq 0) "Stable installed launcher fallback did not run."
}

$journey = Read-Json "journey/session.json"
$expectedPrompt = "I need a simple place to track a daily habit. Set it up for me."
if ($journey) {
  Require ($journey.initialPrompt -ceq $expectedPrompt) "Initial prompt was not the sole canonical ordinary-language request."
  Require ($journey.initialInvocationPromptCount -eq 1) "Initial agent invocation did not contain exactly one prompt."
  Require ($journey.freshSession -eq $true) "Initial agent turn reused an existing session."
  Require (([System.IO.Path]::GetFullPath([string]$journey.workingDirectory)) -eq ([System.IO.Path]::GetFullPath([string]$manifest.workspaceRoot))) "Agent did not start in the isolated workspace root."
  Require (-not $journey.technicalCoaching) "Journey records technical coaching."
  Require ([datetime]$journey.approvalRecordedAt -gt [datetime]$journey.initialTurnCompletedAt) "Version approval was not a later human action."
}

$runtime = Read-Json "runtime/codex-preflight.json"
if ($runtime) {
  Require ($runtime.disposableRootVerified -eq $true) "Codex runtime did not verify a disposable root."
  Require ($runtime.classification -match '^agent-completed') "Codex runtime did not complete."
  Require (@($runtime.attempts).Count -le 2) "Codex runtime exceeded its bounded retry."
}

$beforeVersions = Read-Json "request/before-versions.json"
$briefEnvelope = Read-Json "request/implementation-brief.json"
$afterVersions = Read-Json "request/after-versions.json"
Require ((Versions $beforeVersions).Count -eq 0) "The fresh workspace already had a version."
Require ((Versions $afterVersions).Count -eq 0) "Request created a version before explicit approval."
if ($briefEnvelope) {
  $brief = (Evidence-Data $briefEnvelope).implementationBrief
  Require ($null -ne $brief) "Request did not return an implementation brief."
  if ($brief) {
    Require (([System.IO.Path]::GetFullPath([string]$brief.workspaceRoot)) -eq ([System.IO.Path]::GetFullPath([string]$manifest.workspaceRoot))) "Implementation brief returned the wrong workspace root."
    Require ($brief.request -ceq $expectedPrompt) "Implementation brief did not preserve the request."
    Require ([string]$brief.instructions -match '(?i)has not built|must now implement') "Implementation brief did not hand implementation to the agent."
  }
}

$implementation = Read-Json "implementation/files.json"
$implementationFiles = File-Map $implementation
Require ($implementationFiles.Count -gt 0) "Implementation evidence contains no workspace files."
foreach ($relativePath in $implementationFiles.Keys) {
  $unsafe = [System.IO.Path]::IsPathRooted($relativePath) -or $relativePath.Contains("\") -or $relativePath.Split('/') -contains ".." -or $relativePath.StartsWith(".aimoto/versions/")
  Require (-not $unsafe) "Implementation evidence contains an unsafe or captured-version path: $relativePath."
  if (-not $unsafe) {
    $path = Join-Path $manifest.workspaceRoot $relativePath
    Require (Test-Path -LiteralPath $path -PathType Leaf) "Implemented workspace file is missing: $relativePath."
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      Require ((Get-Sha256 $path) -eq $implementationFiles[$relativePath]) "Implemented workspace file digest changed: $relativePath."
    }
  }
}
if ($implementation) {
  $verification = (Evidence-Data $implementation).verification
  Require ($verification.interactiveUi -eq $true -and $verification.callbacks -eq $true -and $verification.tests -eq $true) "Implementation evidence does not verify UI, callbacks, and tests."
}

$approvalPath = Join-Path $evidenceRoot "approval/human.txt"
if (-not (Test-Path -LiteralPath $approvalPath -PathType Leaf)) {
  Require $false "Missing evidence/approval/human.txt."
} else {
  $approval = Get-Content -LiteralPath $approvalPath -Raw
  Require ($approval -match '(?i)\bapprove\b' -and $approval -match '(?i)\b(save|version)\b') "Human approval does not explicitly authorize saving a version."
}
$createdEnvelope = Read-Json "approval/version-create.json"
$approvedVersionsEnvelope = Read-Json "approval/versions.json"
$createdVersion = Version $createdEnvelope
$approvedVersions = Versions $approvedVersionsEnvelope
$digestPattern = '^sha256:[a-f0-9]{64}$'
if ($createdVersion) {
  Require (-not [string]::IsNullOrWhiteSpace([string]$createdVersion.versionId)) "Version create returned no version ID."
  Require ([long]$createdVersion.revision -gt 0) "Version create did not advance the revision."
  Require ([string]$createdVersion.fileManifestDigest -match $digestPattern) "Version create returned no file manifest digest."
  Require ($null -eq $createdVersion.parentVersionId) "The first version has an unexpected parent."
  Require (@($approvedVersions | Where-Object { $_.versionId -eq $createdVersion.versionId }).Count -eq 1) "The approved version is absent from version history."
}

$beforeRestore = Versions (Read-Json "recovery/before-restore-versions.json")
$restoredVersion = Version (Read-Json "recovery/restore-result.json")
$afterRestore = Versions (Read-Json "recovery/after-restore-versions.json")
$restoredFiles = File-Map (Read-Json "recovery/restored-files.json")
if ($createdVersion -and $restoredVersion) {
  Require ($restoredVersion.versionId -ne $createdVersion.versionId) "Restore overwrote the selected version instead of creating a new one."
  Require ($restoredVersion.parentVersionId -eq $createdVersion.versionId) "Restored version is not linked to the selected version."
  Require ([long]$restoredVersion.revision -gt [long]$createdVersion.revision) "Restore did not advance the revision."
  Require (@($beforeRestore | Where-Object { $_.versionId -eq $createdVersion.versionId }).Count -eq 1) "Selected version was absent before restore."
  Require (@($afterRestore | Where-Object { $_.versionId -eq $createdVersion.versionId }).Count -eq 1) "Restore did not preserve the selected version."
  Require (@($afterRestore | Where-Object { $_.versionId -eq $restoredVersion.versionId }).Count -eq 1) "Restore result is absent from version history."
}
foreach ($relativePath in $implementationFiles.Keys) {
  Require ($restoredFiles.ContainsKey($relativePath)) "Restoration lost workspace file: $relativePath."
  if ($restoredFiles.ContainsKey($relativePath)) {
    Require ($restoredFiles[$relativePath] -eq $implementationFiles[$relativePath]) "Restoration did not recover the captured bytes: $relativePath."
  }
}

$desktop = Read-Json "inspection/desktop-result.json"
if ($desktop) {
  $result = Evidence-Data $desktop
  Require ($result.packaged -eq $true) "Desktop proof is not from the packaged application."
  Require ($result.launched -eq $true -and $result.workspaceOpened -eq $true) "Packaged desktop did not launch and open the workspace."
  Require (-not ([string]$result.executablePath).StartsWith([string]$manifest.repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) "Desktop was launched from the source repository."
  if ($restoredVersion) { Require ($result.currentVersionId -eq $restoredVersion.versionId) "Desktop did not observe the current restored version." }
  Require ([long]$result.versionCount -ge 2) "Desktop did not expose version history."
}

$transcripts = Get-ChildItem -LiteralPath $evidenceRoot -Filter "*.jsonl" -File -Recurse -ErrorAction SilentlyContinue
$transcriptText = ($transcripts | Get-Content -Raw) -join "`n"
Require ($transcriptText -match '(?i)aimoto\s+request') "Agent transcript does not show the installed request command."
Require ($transcriptText -match '(?i)aimoto\s+version\s+create') "Agent transcript does not show explicit version creation."
Require ($transcriptText -notmatch '(?i)module\.install|module bundle|--agent') "Agent transcript used the removed module or generated-app workflow."
Require ($transcriptText -notmatch '(?i)\b(pnpm|npm\s+run|yarn|bun)\b') "Agent used a source/development package runner."
Require ($transcriptText -notmatch [regex]::Escape([string]$manifest.repositoryRoot)) "Agent transcript accessed the source repository."

if (-not $SkipRepositoryCheck) {
  $before = Read-Json "repository-before.json"
  if ($before) {
    $after = @(Get-ChildItem -LiteralPath $manifest.repositoryRoot -File -Recurse |
      Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.git|dist|coverage|release[^\\/]*)[\\/]' } |
      ForEach-Object { [pscustomobject]@{ Path = $_.FullName; Hash = Get-Sha256 $_.FullName } })
    $beforeMap = @{}; foreach ($entry in @($before)) { $beforeMap[$entry.Path] = $entry.Hash }
    $afterMap = @{}; foreach ($entry in $after) { $afterMap[$entry.Path] = $entry.Hash }
    Require (($beforeMap.Keys | Where-Object { -not $afterMap.ContainsKey($_) -or $afterMap[$_] -ne $beforeMap[$_] }).Count -eq 0) "Source repository files changed during acceptance."
    Require (($afterMap.Keys | Where-Object { -not $beforeMap.ContainsKey($_) }).Count -eq 0) "Source repository files were created during acceptance."
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { [Console]::Error.WriteLine("FAIL: $_") }
  exit 1
}
Write-Output "Installed-product role-play evidence passed direct-workspace semantic checks."
