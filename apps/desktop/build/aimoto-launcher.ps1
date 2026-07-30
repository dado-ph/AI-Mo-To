param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $CliArguments
)

$ErrorActionPreference = "Stop"
$executable = Join-Path $PSScriptRoot "AI-Mo-To.exe"

if ($CliArguments.Count -eq 0 -or $CliArguments[0] -ne "open") {
  & $executable --cli @CliArguments
  exit $LASTEXITCODE
}

$forwardedArguments = @($CliArguments | Select-Object -Skip 1)
$workspace = "."
$wantsJson = $false
for ($index = 1; $index -lt $CliArguments.Count; $index++) {
  switch ($CliArguments[$index]) {
    "--workspace" {
      $index++
      if ($index -ge $CliArguments.Count) {
        & $executable --cli open @forwardedArguments
        exit $LASTEXITCODE
      }
      $workspace = $CliArguments[$index]
    }
    "--json" { $wantsJson = $true }
    default {
      # Let the real CLI produce its versioned error envelope for unsupported
      # arguments instead of maintaining a second command parser here.
      & $executable --cli open @forwardedArguments
      exit $LASTEXITCODE
    }
  }
}

# Inspection keeps open's normal validation and canonical workspace resolution,
# but does not create the GUI descendant which makes cmd.exe's start /wait hang.
# Keep stderr separate: Windows PowerShell promotes native stderr lines to error
# records, and Electron/Node may emit a harmless runtime warning there.
$inspectionErrorFile = New-TemporaryFile
$previousErrorActionPreference = $ErrorActionPreference
try {
  # Windows PowerShell turns native stderr into non-terminating ErrorRecords;
  # under the launcher's global Stop policy those become terminating despite
  # explicit file redirection.
  $ErrorActionPreference = "Continue"
  $inspectionText = (& $executable --cli inspect --workspace $workspace --json 2> $inspectionErrorFile.FullName | Out-String).Trim()
  $inspectionExitCode = $LASTEXITCODE
  $inspectionErrorText = [string](Get-Content -LiteralPath $inspectionErrorFile.FullName -Raw -ErrorAction SilentlyContinue)
  $inspectionErrorText = $inspectionErrorText.Trim()
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
  Remove-Item -LiteralPath $inspectionErrorFile.FullName -Force -ErrorAction SilentlyContinue
}
if ($inspectionExitCode -ne 0) {
  if (-not [string]::IsNullOrWhiteSpace($inspectionText)) {
    [Console]::Error.WriteLine($inspectionText)
  }
  if (-not [string]::IsNullOrWhiteSpace($inspectionErrorText)) {
    [Console]::Error.WriteLine($inspectionErrorText)
  }
  exit $inspectionExitCode
}

try {
  $inspectionEnvelope = $inspectionText | ConvertFrom-Json
  $workspaceInspection = $inspectionEnvelope.data
  if ($null -eq $workspaceInspection -or [string]::IsNullOrWhiteSpace($workspaceInspection.root)) {
    throw "The inspect response did not contain a workspace root."
  }

  # Shell execution gives the long-lived GUI its own standard handles.
  # UseShellExecute = $false inherits this launcher's redirected stdout/stderr
  # handles, making a capturing caller wait until the GUI itself closes.
  #
  # A canonical Windows path cannot contain a quote. Reject one defensively
  # before forming the single quoted argument, so workspace text can never add
  # another command-line token.
  $canonicalWorkspace = [string]$workspaceInspection.root
  if ($canonicalWorkspace.Contains('"')) {
    throw "The canonical workspace path contains an invalid quote."
  }
  # CommandLineToArgvW treats backslashes immediately before the closing quote
  # specially, so double a trailing run (for example, a drive-root workspace).
  $quotedWorkspace = $canonicalWorkspace -replace '(\\+)$', '$1$1'
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $executable
  $startInfo.UseShellExecute = $true
  $startInfo.Arguments = '--workspace "' + $quotedWorkspace + '"'
  $launchedProcess = [System.Diagnostics.Process]::Start($startInfo)
  if ($null -eq $launchedProcess) { throw "Windows did not start AI-Mo-To Desktop." }

  if ($wantsJson) {
    $result = [ordered]@{
      envelopeVersion = $inspectionEnvelope.envelopeVersion
      ok = $true
      command = "open"
      traceId = $inspectionEnvelope.traceId
      data = [ordered]@{
        launched = $true
        executable = $executable
        workspace = $workspaceInspection
      }
    }
    [Console]::Out.WriteLine(($result | ConvertTo-Json -Depth 100 -Compress))
  } else {
    [Console]::Out.WriteLine("Opened AI-Mo-To Desktop for $($workspaceInspection.name).")
  }
  exit 0
} catch {
  [Console]::Error.WriteLine("AI-Mo-To Desktop could not be opened. $($_.Exception.Message)")
  exit 1
}
