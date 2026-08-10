# Installed-product role-play harness

This harness proves the direct workspace lifecycle through the packaged product and an unfamiliar external coding agent.

## Run protocol

1. Create an isolated run from the exact installer under test:

   ```powershell
   $run = ./scripts/acceptance/New-InstalledRoleplay.ps1 -ArtifactPath C:\path\to\AI-Mo-To-Setup.exe
   ```

2. Install that artifact with the public one-line command. Save its structured result as `evidence/install/result.json`, then run:

   ```powershell
   ./scripts/acceptance/Test-AimotoPathResilience.ps1 `
     -EvidencePath (Join-Path $run "evidence/install/path-resilience.json")
   ```

3. Start the external agent with only the canonical ordinary-language prompt:

   ```powershell
   ./scripts/acceptance/Invoke-CodexRoleplay.ps1 `
     -RunRoot $run `
     -Prompt "I need a simple place to track a daily habit. Set it up for me."
   ```

   The agent receives no command names, paths, schemas, or debugging help. Capture its JSONL as `evidence/request/agent.jsonl`.

4. Save empty `version list` envelopes from before and after `request` as `request/before-versions.json` and `request/after-versions.json`. Save the request envelope as `request/implementation-brief.json`.

5. Let the agent implement and verify the application directly in the returned root. Save `implementation/files.json` with workspace-relative paths, SHA-256 digests, and real UI/callback/test verification.

6. The agent must stop and ask whether to save the completed work. Record a later explicit human response in `approval/human.txt`. Only then may the resumed agent run `version create`; save its envelope and resulting version list as `approval/version-create.json` and `approval/versions.json`.

7. Save version history before restore, the restore envelope, history after restore, and restored file digests under `recovery/`. Restore must create a new version linked to the selected capture and preserve the earlier version.

8. Save packaged desktop evidence as `inspection/desktop-result.json`, including the executable path, current version ID, and visible version count. Then run:

   ```powershell
   ./scripts/acceptance/Test-InstalledRoleplay.ps1 -RunRoot $run
   ```

## Evidence boundary

The verifier reads CLI envelopes, file hashes, timestamps, version relationships, transcript commands, and packaged executable location. It does not trust fields named `passed`.

Test that boundary deterministically:

```powershell
./scripts/acceptance/Test-SemanticVerifier.ps1
```

The fixture suite includes one complete positive journey and adversarial journeys for premature versioning, approval in the same turn, lost restore bytes, and source-tree desktop substitution.
