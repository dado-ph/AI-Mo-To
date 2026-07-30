[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RunRoot,
  [Parameter(Mandatory)][string]$Prompt,
  [string]$AgentExecutable = "codex",
  [ValidateRange(30, 1800)][int]$TimeoutSeconds = 300,
  [switch]$AllowDisposableDangerFullAccessRetry
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath $RunRoot).Path
$manifestPath = Join-Path $root "evidence/manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$workspace = (Resolve-Path -LiteralPath $manifest.workspaceRoot).Path
$repository = (Resolve-Path -LiteralPath $manifest.repositoryRoot).Path
$runtimeDirectory = Join-Path $root "evidence/runtime"
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$journeyPath = Join-Path $root "evidence/journey/session.json"
$journey = Get-Content -LiteralPath $journeyPath -Raw | ConvertFrom-Json
if ($journey.initialInvocationPromptCount -ne 0) {
  throw "The initial role-play invocation has already occurred; resume separately only after human approval."
}
if ($Prompt -cne $journey.initialPrompt) {
  throw "The initial role-play prompt must be the canonical ordinary-language request without coaching."
}

function Test-IsWithin([string]$Child, [string]$Parent) {
  $childPath = [System.IO.Path]::GetFullPath($Child).TrimEnd('\') + '\'
  $parentPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  return $childPath.StartsWith($parentPath, [System.StringComparison]::OrdinalIgnoreCase)
}

function Invoke-Agent([string]$Sandbox, [string]$Stem) {
  $stdoutPath = Join-Path $runtimeDirectory "$Stem.stdout.jsonl"
  $stderrPath = Join-Path $runtimeDirectory "$Stem.stderr.log"
  $arguments = @("exec", "--json", "-s", $Sandbox, "--cd", $workspace, $Prompt)
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $AgentExecutable
  $startInfo.WorkingDirectory = $workspace
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in $arguments) { [void]$startInfo.ArgumentList.Add($argument) }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $timedOut = -not $process.WaitForExit($TimeoutSeconds * 1000)
  if ($timedOut) {
    $process.Kill($true)
    $process.WaitForExit()
  }
  $stdoutTask.GetAwaiter().GetResult() | Set-Content -LiteralPath $stdoutPath -Encoding utf8
  $stderrTask.GetAwaiter().GetResult() | Set-Content -LiteralPath $stderrPath -Encoding utf8
  return [ordered]@{
    sandbox = $Sandbox
    exitCode = if ($timedOut) { $null } else { $process.ExitCode }
    timedOut = $timedOut
    stdout = $stdoutPath
    stderr = $stderrPath
  }
}

if (-not (Test-IsWithin $workspace $root) -or (Test-IsWithin $root $repository)) {
  throw "Codex role-play root is not a disposable acceptance root outside the repository."
}
$workspaceItem = Get-Item -LiteralPath $workspace
if (($workspaceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw "Codex role-play workspace may not be a reparse point."
}

$attempts = [System.Collections.Generic.List[object]]::new()
$first = Invoke-Agent "workspace-write" "codex-default"
$attempts.Add($first)
$stderr = if (Test-Path -LiteralPath $first.stderr) { Get-Content -LiteralPath $first.stderr -Raw } else { "" }
$stdout = if (Test-Path -LiteralPath $first.stdout) { Get-Content -LiteralPath $first.stdout -Raw } else { "" }
$sandboxSetupDenied = ($stderr + "`n" + $stdout) -match '(?is)codex-windows-sandbox-setup(?:\.exe)?.{0,500}(access is denied|access denied|permission denied|os error 5)'
$productWasReached = ($stderr + "`n" + $stdout) -match '(?i)\baimoto(?:\.exe)?\b'
$classification = if ($first.timedOut) {
  "agent-timeout"
} elseif ($first.exitCode -eq 0) {
  "agent-completed"
} elseif ($sandboxSetupDenied -and -not $productWasReached) {
  "codex-runtime-infrastructure-failure"
} else {
  "agent-or-product-failure"
}

$retryEligible = $classification -eq "codex-runtime-infrastructure-failure" `
  -and $AllowDisposableDangerFullAccessRetry.IsPresent
if ($retryEligible) {
  # One retry only. The manifest-root checks above are the authorization boundary.
  $retry = Invoke-Agent "danger-full-access" "codex-isolated-retry"
  $attempts.Add($retry)
  $classification = if ($retry.timedOut) {
    "agent-timeout-after-infrastructure-retry"
  } elseif ($retry.exitCode -eq 0) {
    "agent-completed-after-infrastructure-retry"
  } else {
    "agent-or-product-failure-after-infrastructure-retry"
  }
}

$result = [ordered]@{
  schemaVersion = 1
  recordedAt = (Get-Date).ToUniversalTime().ToString("o")
  classification = $classification
  sandboxSetupAccessDenied = $sandboxSetupDenied
  productWasReachedBeforeRetry = $productWasReached
  retryRequested = $AllowDisposableDangerFullAccessRetry.IsPresent
  retryEligible = $retryEligible
  disposableRootVerified = $true
  attempts = @($attempts)
}
$resultPath = Join-Path $runtimeDirectory "codex-preflight.json"
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resultPath -Encoding utf8
$result | ConvertTo-Json -Depth 6

$journey.initialInvocationPromptCount = 1
$journey.initialTurnCompletedAt = (Get-Date).ToUniversalTime().ToString("o")
$journey | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $journeyPath -Encoding utf8

if ($classification -notmatch '^agent-completed') { exit 1 }
