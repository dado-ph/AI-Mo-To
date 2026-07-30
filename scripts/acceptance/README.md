# Installed-product role-play harness

This harness tests the product idea, not merely the implementation. A person
states an outcome in ordinary language; an unfamiliar external agent must
discover and use the installed `aimoto` CLI; AI-Mo-To must turn the conversation
into durable, inspectable structure while exact human approval remains the
boundary for consequential changes.

The harness intentionally does not automate Codex approval. Automation here
would erase the human boundary the proof is meant to test.

## Run protocol

1. Build and validate a release candidate. Record the packaged installer:

   ```powershell
   $run = ./scripts/acceptance/New-InstalledRoleplay.ps1 -ArtifactPath C:\path\to\AI-Mo-To-Setup.exe
   ```

2. Install that exact artifact using the public one-line installation command.
   Save the command and structured result under `evidence/install/`.
   Then prove that an agent host with a stale PATH can still use the installed
   integration:

   ```powershell
   ./scripts/acceptance/Test-AimotoPathResilience.ps1 `
     -EvidencePath (Join-Path $run "evidence/install/path-resilience.json")
   ```

   This removes WindowsApps from the child process PATH, resolves the stable
   installed launcher, and invokes `aimoto --help`. An existing launcher must
   not be reported as "not installed" merely because PATH is stale.
3. Run the external agent through the runtime boundary wrapper:

   ```powershell
   ./scripts/acceptance/Invoke-CodexRoleplay.ps1 `
     -RunRoot $run `
     -Prompt "I need a simple place to track a daily habit. Set it up for me."
   ```

   The wrapper captures raw Codex stdout/stderr and writes
   `evidence/runtime/codex-preflight.json`. A failure in
   `codex-windows-sandbox-setup.exe` with an access-denied error, before the
   transcript reaches `aimoto`, is classified as Codex runtime infrastructure
   failure rather than an AI-Mo-To product failure.

   If and only if that exact infrastructure failure occurs, the run root is
   verified as disposable and outside the repository, and the workspace is not
   a reparse point, one bounded fallback attempt is permitted:

   ```powershell
   ./scripts/acceptance/Invoke-CodexRoleplay.ps1 `
     -RunRoot $run `
     -Prompt "I need a simple place to track a daily habit. Set it up for me." `
     -AllowDisposableDangerFullAccessRetry
   ```

   This uses `-s danger-full-access` only inside the isolated acceptance root.
   It does not relax AI-Mo-To approval or product authority boundaries. Never
   use this fallback in the repository, a normal user workspace, or a linked
   directory. The external agent still receives **only**:

   > I need a simple place to track a daily habit. Set it up for me.

   Copy the successful Codex JSONL to `evidence/plan/agent.jsonl`. Do not supply command
   names, paths, schemas, module names, IDs, or debugging help.
4. The first turn must stop after showing the AI-Mo-To proposal. Save
   `plan/before-inspect.json`, `plan/proposal.json`, and
   `plan/after-inspect.json`. The verifier parses the actual CLI envelopes and
   requires planning to leave the revision unchanged. It also requires a
   pending proposal ID, exact digest, and matching base revision.
5. The person reviews the explanation, capabilities, recovery path, proposal ID,
   and digest. Save their explicit sentence containing the exact
   `sha256:...` digest as `evidence/approval/human.txt`. Resume the same agent
   session with that sentence and capture `evidence/approval/agent.jsonl`.
6. Before the correct approval, attempt the proposal with a different digest.
   Save the before inspection, error envelope, and after inspection under
   `negative/wrong-digest-*.json`. Separately retain a genuinely stale proposal
   and save the equivalent `negative/stale-*.json` triplet. Both rejections must
   leave the revision unchanged; a prose statement that they passed is not
   evidence.
7. Capture post-change inspection and provenance linked to proposal ID, digest,
   and resulting revision. Create a habit record and a completion/log event;
   save the CLI envelopes as `inspection/record-create.json` and
   `inspection/record-log.json`. Save later changed values in
   `inspection/post-change-records.json`.
8. Create a snapshot with ID, revision, and timestamp metadata. Propose
   restoration, retain a wrong-digest rejection triplet under `recovery/`, and
   save a separate exact human approval as `recovery/human-approval.txt`.
   `restore-result.json` must show a new revision, `restored-records.json` must
   show the snapshotted values, and `history.json` must retain prior and restore
   events.
9. Capture `inspection/desktop-result.json` from the packaged executable. It
   must identify the executable outside the repository and demonstrate that the
   workspace, installed module, and records were actually observed. Run:

   ```powershell
   ./scripts/acceptance/Test-InstalledRoleplay.ps1 -RunRoot $run
   ```

## Evidence boundary

The verifier does not trust manifest phase labels or fields named `passed`.
It semantically parses CLI JSON and transcript evidence, and cross-checks
identities, digests, revisions, record values, provenance, recovery history,
and packaged executable location. Test that boundary without Codex:

```powershell
./scripts/acceptance/Test-SemanticVerifier.ps1
```

The fixture test includes one complete positive journey and adversarial bundles
that self-assert success, mutate during planning/rejection, lose restored data,
or substitute a source-tree desktop. The evidence schema is
`evidence.schema.json`.

The transcript is the authority. Technical coaching invalidates the run and
must be logged as a product failure, repaired, and attempted again from a new
run root. Never edit evidence to turn a failed journey into a pass.
