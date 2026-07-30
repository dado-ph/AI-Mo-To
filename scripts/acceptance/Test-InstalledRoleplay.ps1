[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RunRoot,
  [switch]$SkipRepositoryCheck
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath $RunRoot).Path
$evidenceRoot = Join-Path $root "evidence"
$manifestPath = Join-Path $evidenceRoot "manifest.json"
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
function Revision($value) {
  $body = Evidence-Data $value
  if ($null -ne $body.workspace -and $null -ne $body.workspace.revision) { return [long]$body.workspace.revision }
  if ($null -ne $body.revision) { return [long]$body.revision }
  return -1
}
function Proposal($value) {
  $body = Evidence-Data $value
  if ($null -ne $body.proposal) { return $body.proposal }
  return $body
}
function Error-Code($value) {
  if ($null -ne $value.error.code) { return [string]$value.error.code }
  if ($null -ne $value.code -and $value.ok -eq $false) { return [string]$value.code }
  return ""
}
function Records($value) {
  $body = Evidence-Data $value
  if ($body -is [array]) { return @($body) }
  if ($null -ne $body.records) { return @($body.records) }
  if ($null -ne $body.events) { return @($body.events) }
  if ($null -ne $body.record) { return @($body.record) }
  return @($body)
}
function Record-Id($value) {
  if ($null -ne $value.recordId) { return [string]$value.recordId }
  if ($null -ne $value.data.recordId) { return [string]$value.data.recordId }
  if ($null -ne $value.data.habitId) { return [string]$value.data.habitId }
  return ""
}
function Canonical($value) { return ($value | ConvertTo-Json -Depth 30 -Compress) }

$manifest = Read-Json "manifest.json"
if ($null -eq $manifest) { exit 1 }
Require ($manifest.schemaVersion -eq 2) "Unsupported evidence schema; semantic evidence version 2 is required."
Require (-not ([string]$manifest.isolationRoot).StartsWith([string]$manifest.repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) "Run is inside the repository."
Require (([System.IO.Path]::GetFullPath([string]$manifest.workspaceRoot)).StartsWith(([System.IO.Path]::GetFullPath([string]$manifest.isolationRoot)), [System.StringComparison]::OrdinalIgnoreCase)) "Workspace is not inside the fresh isolation root."
Require (Test-Path -LiteralPath $manifest.artifact.path -PathType Leaf) "Recorded installer artifact is missing."
if (Test-Path -LiteralPath $manifest.artifact.path -PathType Leaf) {
  Require ((Get-FileHash -LiteralPath $manifest.artifact.path -Algorithm SHA256).Hash -eq $manifest.artifact.sha256) "Installer artifact digest changed."
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
}

$runtime = Read-Json "runtime/codex-preflight.json"
if ($runtime) {
  Require ($runtime.disposableRootVerified -eq $true) "Codex runtime did not verify a disposable root."
  Require ($runtime.classification -match '^agent-completed') "Codex runtime did not complete."
  Require (@($runtime.attempts).Count -le 2) "Codex runtime exceeded its bounded retry."
}

$beforePlan = Read-Json "plan/before-inspect.json"
$proposalEnvelope = Read-Json "plan/proposal.json"
$afterPlan = Read-Json "plan/after-inspect.json"
$proposal = Proposal $proposalEnvelope
$digestPattern = '^sha256:[a-f0-9]{64}$'
if ($beforePlan -and $proposal -and $afterPlan) {
  $beforeRevision = Revision $beforePlan
  $afterPlanRevision = Revision $afterPlan
  Require ($beforeRevision -ge 0 -and $afterPlanRevision -eq $beforeRevision) "Planning mutated the workspace revision."
  Require (-not [string]::IsNullOrWhiteSpace([string]$proposal.proposalId)) "Proposal has no proposal ID."
  Require ([string]$proposal.changeSetDigest -match $digestPattern) "Proposal has no valid exact digest."
  Require ([long]$proposal.baseRevision -eq $beforeRevision) "Proposal base revision does not match the inspected revision."
  Require ($proposal.status -eq "pending") "Plan evidence is not a pending proposal."
}

$wrongBefore = Read-Json "negative/wrong-digest-before.json"
$wrongAttempt = Read-Json "negative/wrong-digest-attempt.json"
$wrongAfter = Read-Json "negative/wrong-digest-after.json"
if ($wrongBefore -and $wrongAttempt -and $wrongAfter -and $proposal) {
  Require ((Error-Code $wrongAttempt) -match '(?i)digest|hash|approval') "Wrong-digest attempt was not rejected for its digest."
  Require ((Revision $wrongBefore) -eq (Revision $wrongAfter)) "Wrong-digest rejection mutated the revision."
  $attemptBody = Evidence-Data $wrongAttempt
  if ($attemptBody.attemptedDigest) { Require ($attemptBody.attemptedDigest -ne $proposal.changeSetDigest) "Wrong-digest evidence used the correct digest." }
}

$staleBefore = Read-Json "negative/stale-before.json"
$staleAttempt = Read-Json "negative/stale-attempt.json"
$staleAfter = Read-Json "negative/stale-after.json"
if ($staleBefore -and $staleAttempt -and $staleAfter) {
  Require ((Error-Code $staleAttempt) -match '(?i)stale|revision|precondition') "Stale proposal was not rejected as stale."
  Require ((Revision $staleBefore) -eq (Revision $staleAfter)) "Stale rejection mutated the revision."
  $staleBody = Evidence-Data $staleAttempt
  if ($null -ne $staleBody.baseRevision) { Require ([long]$staleBody.baseRevision -lt (Revision $staleBefore)) "Stale evidence does not identify an older base revision." }
}

$approvalPath = Join-Path $evidenceRoot "approval/human.txt"
if (-not (Test-Path -LiteralPath $approvalPath -PathType Leaf)) { Require $false "Missing evidence/approval/human.txt." }
elseif ($proposal) {
  $approval = Get-Content -LiteralPath $approvalPath -Raw
  Require ($approval -match '(?i)\bapprove\b') "Later human approval is not explicit."
  Require ($approval.Contains([string]$proposal.proposalId)) "Human approval is not bound to the proposal ID."
  Require ($approval.Contains([string]$proposal.changeSetDigest)) "Human approval is not bound to the exact proposal digest."
  if ($journey) { Require ([datetime]$journey.approvalRecordedAt -gt [datetime]$journey.initialTurnCompletedAt) "Approval was not a later human action." }
}

$afterApply = Read-Json "approval/after-inspect.json"
$provenance = Read-Json "inspection/provenance.json"
if ($afterApply -and $proposal) {
  Require ((Revision $afterApply) -gt [long]$proposal.baseRevision) "Approved apply did not advance the revision."
  $body = Evidence-Data $afterApply
  Require (@($body.modules).Count -gt 0) "Post-apply inspection contains no installed module."
}
if ($provenance -and $proposal -and $afterApply) {
  $p = Evidence-Data $provenance
  $pText = Canonical $p
  Require ($pText.Contains([string]$proposal.proposalId)) "Provenance is not linked to the applied proposal."
  Require ($pText.Contains([string]$proposal.changeSetDigest)) "Provenance is not linked to the approved digest."
  Require ($pText -match [regex]::Escape([string](Revision $afterApply))) "Provenance is not linked to the resulting revision."
}

$created = Read-Json "inspection/record-create.json"
$logged = Read-Json "inspection/record-log.json"
$postChange = Read-Json "inspection/post-change-records.json"
$createdId = ""
if ($created) {
  $createdRecords = Records $created
  $createdId = Record-Id $createdRecords[0]
  Require (-not [string]::IsNullOrWhiteSpace($createdId)) "Record-create evidence has no durable record ID."
}
if ($logged -and $createdId) {
  $logText = Canonical (Records $logged)
  Require ($logText.Contains($createdId)) "Record log does not contain the created record."
  Require ($logText -match '(?i)created|completed|logged|entry') "Record log contains no usable create/log event."
}
if ($postChange -and $createdId) {
  Require ((Canonical (Records $postChange)).Contains($createdId)) "Post-change records lost the created record before restoration."
}

$snapshot = Read-Json "recovery/snapshot.json"
$restoreProposalEnvelope = Read-Json "recovery/restore-proposal.json"
$restoreWrongBefore = Read-Json "recovery/wrong-digest-before.json"
$restoreWrongAttempt = Read-Json "recovery/wrong-digest-attempt.json"
$restoreWrongAfter = Read-Json "recovery/wrong-digest-after.json"
$restoreResult = Read-Json "recovery/restore-result.json"
$restoredRecords = Read-Json "recovery/restored-records.json"
$history = Read-Json "recovery/history.json"
$restoreProposal = Proposal $restoreProposalEnvelope
if ($snapshot) {
  $s = Evidence-Data $snapshot
  Require (-not [string]::IsNullOrWhiteSpace([string]$s.snapshotId)) "Snapshot has no content-addressed ID."
  Require ($null -ne $s.revision -or $null -ne $s.manifest.workspace.revision) "Snapshot has no revision metadata."
  Require ($null -ne $s.createdAt -or $null -ne $s.manifest.createdAt) "Snapshot has no creation metadata."
}
if ($restoreProposal) {
  Require ($restoreProposal.status -eq "pending") "Restore evidence is not a pending proposal."
  Require ([string]$restoreProposal.changeSetDigest -match $digestPattern) "Restore proposal has no exact digest."
  Require ((Canonical $restoreProposal) -match 'restore') "Restore proposal does not describe restoration."
}
if ($restoreWrongBefore -and $restoreWrongAttempt -and $restoreWrongAfter) {
  Require ((Error-Code $restoreWrongAttempt) -match '(?i)digest|hash|approval') "Wrong restore digest was not rejected."
  Require ((Revision $restoreWrongBefore) -eq (Revision $restoreWrongAfter)) "Wrong restore digest mutated the revision."
}
$restoreApprovalPath = Join-Path $evidenceRoot "recovery/human-approval.txt"
if (-not (Test-Path -LiteralPath $restoreApprovalPath -PathType Leaf)) { Require $false "Missing evidence/recovery/human-approval.txt." }
elseif ($restoreProposal) {
  $restoreApproval = Get-Content -LiteralPath $restoreApprovalPath -Raw
  Require ($restoreApproval -match '(?i)\bapprove\b' -and $restoreApproval.Contains([string]$restoreProposal.proposalId) -and $restoreApproval.Contains([string]$restoreProposal.changeSetDigest)) "Restore approval is not explicit and exactly bound."
}
if ($restoreResult -and $restoreProposal) {
  $restoreRevision = Revision $restoreResult
  Require ($restoreRevision -gt [long]$restoreProposal.baseRevision) "Approved restore did not create a new revision."
}
if ($restoredRecords -and $createdId) {
  Require ((Canonical (Records $restoredRecords)).Contains($createdId)) "Restoration did not recover the original record values."
}
if ($history -and $restoreResult) {
  $historyText = Canonical (Evidence-Data $history)
  Require ($historyText -match '(?i)restore') "History does not retain the restore event."
  Require ($historyText -match [regex]::Escape([string](Revision $restoreResult))) "History does not retain the new restore revision."
}

$desktop = Read-Json "inspection/desktop-result.json"
if ($desktop) {
  $d = Evidence-Data $desktop
  Require ($d.packaged -eq $true) "Desktop proof is not from the packaged application."
  Require ($d.launched -eq $true -and $d.workspaceOpened -eq $true) "Packaged desktop did not launch and open the workspace."
  Require (-not [string]::IsNullOrWhiteSpace([string]$d.executablePath)) "Packaged desktop proof has no executable path."
  Require (-not ([string]$d.executablePath).StartsWith([string]$manifest.repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) "Desktop was launched from the source repository."
  Require ($d.observedModule -eq $true -and $d.observedRecords -eq $true) "Packaged desktop proof did not observe the installed module and records."
}

$transcripts = Get-ChildItem -LiteralPath $evidenceRoot -Filter "*.jsonl" -File -Recurse -ErrorAction SilentlyContinue
$transcriptText = ($transcripts | Get-Content -Raw) -join "`n"
Require ($transcriptText -match '(?i)\baimoto(?:\.exe)?\b') "Agent transcript does not show use of the installed aimoto CLI."
Require ($transcriptText -notmatch '(?i)\b(pnpm|npm\s+run|yarn|bun)\b') "Agent used a source/development package runner."
Require ($transcriptText -notmatch [regex]::Escape([string]$manifest.repositoryRoot)) "Agent transcript accessed the source repository."

if (-not $SkipRepositoryCheck) {
  $before = Read-Json "repository-before.json"
  if ($before) {
    $after = @(Get-ChildItem -LiteralPath $manifest.repositoryRoot -File -Recurse |
      Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.git|dist|coverage|release[^\\/]*)[\\/]' } |
      Get-FileHash -Algorithm SHA256 | Select-Object Path, Hash)
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
Write-Output "Installed-product role-play evidence passed semantic checks."

