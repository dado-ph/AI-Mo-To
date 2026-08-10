[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$verifier = Join-Path $PSScriptRoot "Test-InstalledRoleplay.ps1"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("aimoto-verifier-" + [guid]::NewGuid().ToString("N"))
$validRoot = Join-Path $testRoot "valid"
$evidence = Join-Path $validRoot "evidence"
$workspace = Join-Path $validRoot "user-workspace"
$repository = Join-Path $testRoot "source-repository"
$artifact = Join-Path $testRoot "AI-Mo-To-Setup.exe"
$uiPath = Join-Path $workspace "ui/index.html"
New-Item -ItemType Directory -Path $evidence, (Split-Path -Parent $uiPath), $repository -Force | Out-Null
Set-Content -LiteralPath $artifact -Value "fixture installer" -Encoding utf8
Set-Content -LiteralPath $uiPath -Value '<button id="log">Log habit</button>' -Encoding utf8

function Write-Json([string]$relative, $value) {
  $path = Join-Path $evidence $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
  $value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $path -Encoding utf8
}
function Get-Sha256([string]$path) {
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($hasher.ComputeHash([System.IO.File]::ReadAllBytes($path))) -replace "-", "").ToLowerInvariant()
  } finally { $hasher.Dispose() }
}
function Envelope($data) { return [ordered]@{ ok = $true; data = $data } }
function Versions([object[]]$versions) { return Envelope @{ versions = $versions } }

$version1 = [ordered]@{
  schemaVersion = 1; versionId = "version-initial"; workspaceId = "workspace-fixture"; revision = 1
  createdAt = "2026-08-10T00:03:00Z"; message = "Implement habit tracker"; parentVersionId = $null
  fileManifestDigest = "sha256:" + ("a" * 64)
}
$version2 = [ordered]@{
  schemaVersion = 1; versionId = "version-restore"; workspaceId = "workspace-fixture"; revision = 2
  createdAt = "2026-08-10T00:05:00Z"; message = "Restore version-initial"; parentVersionId = "version-initial"
  fileManifestDigest = "sha256:" + ("b" * 64)
}
$uiDigest = Get-Sha256 $uiPath

Write-Json "manifest.json" ([ordered]@{
  schemaVersion = 3; runId = "fixture"; startedAt = "2026-08-10T00:00:00Z"
  isolationRoot = $validRoot; workspaceRoot = $workspace; repositoryRoot = $repository
  artifact = @{ path = $artifact; sha256 = Get-Sha256 $artifact }; phases = @{}
})
Write-Json "journey/session.json" ([ordered]@{
  initialPrompt = "I need a simple place to track a daily habit. Set it up for me."
  initialInvocationPromptCount = 1; freshSession = $true; workingDirectory = $workspace
  technicalCoaching = $false; initialTurnCompletedAt = "2026-08-10T00:01:00Z"; approvalRecordedAt = "2026-08-10T00:02:00Z"
})
Write-Json "runtime/codex-preflight.json" @{ disposableRootVerified = $true; classification = "agent-completed"; attempts = @(@{ exitCode = 0 }) }
Write-Json "install/result.json" (Envelope @{ installed = $true; exitCode = 0; command = "irm https://example.invalid/install.ps1 | iex" })
Write-Json "install/path-resilience.json" @{ windowsAppsAbsentFromPath = $true; launcherExists = $true; invoked = $true; exitCode = 0 }
Write-Json "request/before-versions.json" (Versions @())
Write-Json "request/implementation-brief.json" (Envelope @{ implementationBrief = @{
  workspaceRoot = $workspace; workspaceId = "workspace-fixture"; request = "I need a simple place to track a daily habit. Set it up for me."
  instructions = "AI-Mo-To has not built this workspace. You must now implement the workspace in $workspace."
}})
Write-Json "request/after-versions.json" (Versions @())
Write-Json "implementation/files.json" (Envelope @{
  files = @(@{ path = "ui/index.html"; sha256 = $uiDigest })
  verification = @{ interactiveUi = $true; callbacks = $true; tests = $true }
})
New-Item -ItemType Directory -Path (Join-Path $evidence "approval") -Force | Out-Null
Set-Content -LiteralPath (Join-Path $evidence "approval/human.txt") -Value "I approve saving the completed workspace as a new version." -Encoding utf8
Write-Json "approval/version-create.json" (Envelope @{ version = $version1 })
Write-Json "approval/versions.json" (Versions @($version1))
Write-Json "recovery/before-restore-versions.json" (Versions @($version1))
Write-Json "recovery/restore-result.json" (Envelope @{ version = $version2 })
Write-Json "recovery/after-restore-versions.json" (Versions @($version1, $version2))
Write-Json "recovery/restored-files.json" (Envelope @{ files = @(@{ path = "ui/index.html"; sha256 = $uiDigest }) })
Write-Json "inspection/desktop-result.json" (Envelope @{
  packaged = $true; launched = $true; workspaceOpened = $true
  executablePath = (Join-Path $testRoot "installed/AI-Mo-To.exe")
  currentVersionId = "version-restore"; versionCount = 2
})
Set-Content -LiteralPath (Join-Path $evidence "request/agent.jsonl") -Value '{"type":"agent_message","text":"I ran aimoto request, implemented ui/index.html, verified it, received later approval, then ran aimoto version create."}' -Encoding utf8

function Invoke-Verifier([string]$fixtureRoot) {
  $stdout = Join-Path $fixtureRoot "verifier.stdout"
  $stderr = Join-Path $fixtureRoot "verifier.stderr"
  $process = Start-Process -FilePath (Join-Path $PSHOME "powershell.exe") -ArgumentList @(
    "-NoProfile", "-File", $verifier, "-RunRoot", $fixtureRoot, "-SkipRepositoryCheck"
  ) -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  return @{ ExitCode = $process.ExitCode; Output = ((Get-Content $stdout -Raw -ErrorAction SilentlyContinue) + (Get-Content $stderr -Raw -ErrorAction SilentlyContinue)) }
}
function Copy-Fixture([string]$name) {
  $destination = Join-Path $testRoot $name
  Copy-Item -LiteralPath $validRoot -Destination $destination -Recurse
  $manifestPath = Join-Path $destination "evidence/manifest.json"
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
  $manifest.isolationRoot = $destination
  $manifest.workspaceRoot = Join-Path $destination "user-workspace"
  $manifest | ConvertTo-Json -Depth 20 | Set-Content $manifestPath -Encoding utf8
  $sessionPath = Join-Path $destination "evidence/journey/session.json"
  $session = Get-Content $sessionPath -Raw | ConvertFrom-Json
  $session.workingDirectory = $manifest.workspaceRoot
  $session | ConvertTo-Json -Depth 10 | Set-Content $sessionPath -Encoding utf8
  $briefPath = Join-Path $destination "evidence/request/implementation-brief.json"
  $brief = Get-Content $briefPath -Raw | ConvertFrom-Json
  $brief.data.implementationBrief.workspaceRoot = $manifest.workspaceRoot
  $brief | ConvertTo-Json -Depth 10 | Set-Content $briefPath -Encoding utf8
  return $destination
}

try {
  $positive = Invoke-Verifier $validRoot
  if ($positive.ExitCode -ne 0) { throw "Positive fixture failed:`n$($positive.Output)" }

  $cases = @(
    @{ Name = "request-created-version"; Edit = {
      param($caseRoot)
      Versions @($version1) | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $caseRoot "evidence/request/after-versions.json") -Encoding utf8
    }},
    @{ Name = "approval-not-later"; Edit = {
      param($caseRoot)
      $path = Join-Path $caseRoot "evidence/journey/session.json"; $value = Get-Content $path -Raw | ConvertFrom-Json
      $value.approvalRecordedAt = $value.initialTurnCompletedAt; $value | ConvertTo-Json -Depth 10 | Set-Content $path -Encoding utf8
    }},
    @{ Name = "restore-loses-file"; Edit = {
      param($caseRoot)
      Envelope @{ files = @(@{ path = "ui/index.html"; sha256 = ("0" * 64) }) } | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $caseRoot "evidence/recovery/restored-files.json") -Encoding utf8
    }},
    @{ Name = "source-desktop"; Edit = {
      param($caseRoot)
      Envelope @{ packaged = $true; launched = $true; workspaceOpened = $true; executablePath = (Join-Path $repository "desktop.exe"); currentVersionId = "version-restore"; versionCount = 2 } |
        ConvertTo-Json -Depth 10 | Set-Content (Join-Path $caseRoot "evidence/inspection/desktop-result.json") -Encoding utf8
    }}
  )
  foreach ($case in $cases) {
    $caseRoot = Copy-Fixture $case.Name
    & $case.Edit $caseRoot
    $result = Invoke-Verifier $caseRoot
    if ($result.ExitCode -eq 0) { throw "Adversarial fixture '$($case.Name)' was incorrectly accepted." }
  }
  Write-Output "Semantic verifier fixtures passed (1 positive, $($cases.Count) adversarial negative)."
} finally {
  Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
