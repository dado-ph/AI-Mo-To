[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ArtifactPath,
  [string]$EvidenceRoot = (Join-Path ([System.IO.Path]::GetTempPath()) "aimoto-acceptance"),
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
)

$ErrorActionPreference = "Stop"
$artifact = (Resolve-Path -LiteralPath $ArtifactPath).Path
$repo = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$runId = [guid]::NewGuid().ToString("N")
$root = Join-Path ([System.IO.Path]::GetFullPath($EvidenceRoot)) $runId
$workspace = Join-Path $root "user-workspace"
$evidence = Join-Path $root "evidence"
New-Item -ItemType Directory -Path $workspace, $evidence, (Join-Path $evidence "runtime") -Force | Out-Null

if ($root.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Acceptance isolation root must be outside the source repository."
}

$manifest = [ordered]@{
  schemaVersion = 3
  runId = $runId
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
  isolationRoot = $root
  workspaceRoot = $workspace
  repositoryRoot = $repo
  artifact = [ordered]@{
    path = $artifact
    sha256 = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  phases = [ordered]@{}
}
foreach ($name in "install", "request", "implementation", "approval", "inspection", "recovery") {
  $manifest.phases[$name] = [ordered]@{ status = "pending"; evidence = @() }
}
$journeyDirectory = Join-Path $evidence "journey"
New-Item -ItemType Directory -Path $journeyDirectory -Force | Out-Null
[ordered]@{
  schemaVersion = 1
  initialPrompt = "I need a simple place to track a daily habit. Set it up for me."
  initialInvocationPromptCount = 0
  freshSession = $true
  workingDirectory = $workspace
  technicalCoaching = $false
  initialTurnCompletedAt = $null
  approvalRecordedAt = $null
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $journeyDirectory "session.json") -Encoding utf8
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence "manifest.json") -Encoding utf8

$repoBaseline = Get-ChildItem -LiteralPath $repo -File -Recurse |
  Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.git|dist|coverage|release[^\\/]*)[\\/]' } |
  Get-FileHash -Algorithm SHA256 |
  Select-Object Path, Hash
$repoBaseline | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $evidence "repository-before.json") -Encoding utf8

@"
Run created: $runId
Isolation root: $root
Workspace root: $workspace
Evidence manifest: $(Join-Path $evidence "manifest.json")

Install the recorded artifact for this isolated test profile. Then start the
external agent from Workspace root with only this user message:

I need a simple place to track a daily habit. Set it up for me.

Continue until the requested workspace UI and behavior work and have been
verified. Stop before creating a version. The human must inspect the completed
result and explicitly approve saving it in a later turn.
"@ | Set-Content -LiteralPath (Join-Path $root "NEXT.txt") -Encoding utf8

Write-Output $root
