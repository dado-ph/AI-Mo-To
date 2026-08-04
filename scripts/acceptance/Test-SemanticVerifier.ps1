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
New-Item -ItemType Directory -Path $evidence, $workspace, $repository -Force | Out-Null
Set-Content -LiteralPath $artifact -Value "fixture installer" -Encoding utf8

function Write-Json([string]$relative, $value) {
  $path = Join-Path $evidence $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
  $value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $path -Encoding utf8
}
function Get-Sha256([string]$path) {
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($hasher.ComputeHash([System.IO.File]::ReadAllBytes($path))) -replace "-", "").ToLowerInvariant()
  } finally {
    $hasher.Dispose()
  }
}
function Envelope($data) { return [ordered]@{ ok = $true; data = $data } }
function Inspect([long]$revision, [bool]$withModule = $false) {
  return Envelope ([ordered]@{
    workspaceId = "workspace-fixture"; revision = $revision
    modules = if ($withModule) { @([ordered]@{ moduleId = "local.meditation-tracker"; version = "1.0.0" }) } else { @() }
  })
}

$digest = "sha256:" + ("a" * 64)
$restoreDigest = "sha256:" + ("b" * 64)
$proposalId = "proposal-habit"
$restoreProposalId = "proposal-restore"
$snapshotId = "sha256:" + ("c" * 64)
Write-Json "manifest.json" ([ordered]@{
  schemaVersion = 2; runId = "fixture"; startedAt = "2026-07-29T00:00:00Z"
  isolationRoot = $validRoot; workspaceRoot = $workspace; repositoryRoot = $repository
  artifact = @{ path = $artifact; sha256 = Get-Sha256 $artifact }
  phases = @{}
})
Write-Json "journey/session.json" ([ordered]@{
  initialPrompt = "I need a simple place to track a daily habit. Set it up for me."
  initialInvocationPromptCount = 1; freshSession = $true; workingDirectory = $workspace
  technicalCoaching = $false; initialTurnCompletedAt = "2026-07-29T00:01:00Z"; approvalRecordedAt = "2026-07-29T00:02:00Z"
})
Write-Json "runtime/codex-preflight.json" @{ disposableRootVerified = $true; classification = "agent-completed"; attempts = @(@{ exitCode = 0 }) }
Write-Json "install/result.json" (Envelope @{ installed = $true; exitCode = 0; command = "irm https://example.invalid/install.ps1 | iex" })
Write-Json "install/path-resilience.json" @{ windowsAppsAbsentFromPath = $true; launcherExists = $true; invoked = $true; exitCode = 0 }
Write-Json "plan/before-inspect.json" (Inspect 0)
Write-Json "plan/proposal.json" (Envelope @{ proposal = @{
  proposalId = $proposalId; changeSetDigest = $digest; baseRevision = 0; status = "pending"
  changeSet = @{ operations = @(@{ kind = "module.install" }) }
}})
Write-Json "plan/after-inspect.json" (Inspect 0)
Write-Json "negative/wrong-digest-before.json" (Inspect 0)
Write-Json "negative/wrong-digest-attempt.json" @{ ok = $false; error = @{ code = "ApprovalDigestMismatch" }; data = @{ attemptedDigest = ("sha256:" + ("d" * 64)) } }
Write-Json "negative/wrong-digest-after.json" (Inspect 0)
Write-Json "negative/stale-before.json" (Inspect 2 $true)
Write-Json "negative/stale-attempt.json" @{ ok = $false; error = @{ code = "StaleProposal" }; data = @{ baseRevision = 1 } }
Write-Json "negative/stale-after.json" (Inspect 2 $true)
New-Item -ItemType Directory -Path (Join-Path $evidence "approval") -Force | Out-Null
Set-Content -LiteralPath (Join-Path $evidence "approval/human.txt") -Value "I approve $proposalId with exact digest $digest" -Encoding utf8
Write-Json "approval/after-inspect.json" (Inspect 1 $true)
Write-Json "inspection/provenance.json" (Envelope @{ proposalId = $proposalId; changeSetDigest = $digest; resultingRevision = 1 })
Write-Json "inspection/record-create.json" (Envelope @{ record = @{ recordId = "habit-water"; data = @{ name = "Drink water" } } })
Write-Json "inspection/record-log.json" (Envelope @{ events = @(@{ eventType = "record.created"; recordId = "habit-water" }, @{ eventType = "entry.logged"; recordId = "habit-water" }) })
Write-Json "inspection/post-change-records.json" (Envelope @{ records = @(@{ recordId = "habit-water"; data = @{ name = "Changed water" } }) })
Write-Json "inspection/desktop-result.json" (Envelope @{
  packaged = $true; launched = $true; workspaceOpened = $true
  executablePath = (Join-Path $testRoot "installed/AI-Mo-To.exe")
  observedModule = $true; observedRecords = $true
})
Write-Json "recovery/snapshot.json" (Envelope @{ snapshotId = $snapshotId; revision = 1; createdAt = "2026-07-29T00:03:00Z" })
Write-Json "recovery/restore-proposal.json" (Envelope @{
  proposalId = $restoreProposalId; changeSetDigest = $restoreDigest; baseRevision = 3; status = "pending"
  changeSet = @{ operations = @(@{ kind = "workspace.restore-snapshot"; snapshotId = $snapshotId }) }
})
Write-Json "recovery/wrong-digest-before.json" (Inspect 3 $true)
Write-Json "recovery/wrong-digest-attempt.json" @{ ok = $false; error = @{ code = "ApprovalDigestMismatch" } }
Write-Json "recovery/wrong-digest-after.json" (Inspect 3 $true)
Set-Content -LiteralPath (Join-Path $evidence "recovery/human-approval.txt") -Value "I approve $restoreProposalId with exact digest $restoreDigest" -Encoding utf8
Write-Json "recovery/restore-result.json" (Inspect 4 $true)
Write-Json "recovery/restored-records.json" (Envelope @{ records = @(@{ recordId = "habit-water"; data = @{ name = "Drink water" } }) })
Write-Json "recovery/history.json" (Envelope @{ events = @(@{ type = "proposal.committed"; revision = 1 }, @{ type = "snapshot.restored"; revision = 4 }) })
Set-Content -LiteralPath (Join-Path $evidence "plan/agent.jsonl") -Value '{"type":"agent_message","text":"I used aimoto to prepare a proposal."}' -Encoding utf8

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
  return $destination
}

try {
  $positive = Invoke-Verifier $validRoot
  if ($positive.ExitCode -ne 0) { throw "Positive fixture failed:`n$($positive.Output)" }

  $cases = @(
    @{ Name = "self-asserted"; Edit = {
      param($caseRoot)
      $path = Join-Path $caseRoot "evidence/negative/wrong-digest-attempt.json"
      @{ passed = $true; status = "passed" } | ConvertTo-Json | Set-Content $path -Encoding utf8
    }},
    @{ Name = "plan-mutates"; Edit = {
      param($caseRoot)
      $path = Join-Path $caseRoot "evidence/plan/after-inspect.json"
      Inspect 1 | ConvertTo-Json -Depth 10 | Set-Content $path -Encoding utf8
    }},
    @{ Name = "wrong-digest-mutates"; Edit = {
      param($caseRoot)
      $path = Join-Path $caseRoot "evidence/negative/wrong-digest-after.json"
      Inspect 1 | ConvertTo-Json -Depth 10 | Set-Content $path -Encoding utf8
    }},
    @{ Name = "restore-loses-record"; Edit = {
      param($caseRoot)
      $path = Join-Path $caseRoot "evidence/recovery/restored-records.json"
      Envelope @{ records = @() } | ConvertTo-Json -Depth 10 | Set-Content $path -Encoding utf8
    }},
    @{ Name = "source-desktop"; Edit = {
      param($caseRoot)
      $path = Join-Path $caseRoot "evidence/inspection/desktop-result.json"
      Envelope @{ packaged = $true; launched = $true; workspaceOpened = $true; executablePath = (Join-Path $repository "desktop.exe"); observedModule = $true; observedRecords = $true } |
        ConvertTo-Json -Depth 10 | Set-Content $path -Encoding utf8
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
