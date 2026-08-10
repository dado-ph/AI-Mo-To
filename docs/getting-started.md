# Get started with AI-Mo-To

AI-Mo-To creates a canonical local workspace, supplies implementation context to a coding agent, and captures completed files only when you explicitly approve a version.

## 1. Create a workspace

Ordinary workspaces live under `%LOCALAPPDATA%\AI-Mo-To\workspaces\<name>` unless you supply another root.

```powershell
$workspace = Join-Path $env:LOCALAPPDATA "AI-Mo-To\workspaces\my-workspace"
aimoto workspace create "My Workspace" --root $workspace
aimoto inspect --workspace $workspace
```

A new root contains only `.aimoto/workspace.json`, `.aimoto/notes.json`, `.aimoto/versions`, and local metadata storage. Application directories appear only when the agent needs them.

## 2. Request implementation context

```powershell
$handoff = aimoto request "Create a local project tracker with due dates and a weekly view" --workspace $workspace --json | ConvertFrom-Json
$handoff.data.implementationBrief
```

`request` creates or reuses the workspace and returns its canonical root plus curated implementation rules. It does not build the application or create a version. The coding agent must work directly beneath `implementationBrief.workspaceRoot`, connect controls to real behavior, and verify the result.

## 3. Review the working result

The agent should show what it implemented and the verification it ran, then ask whether you want to save those files as a new workspace version. Approval must arrive in a later message; the initial request is not approval to version the result.

```powershell
# Run only after explicit approval to save the completed implementation.
aimoto version create --workspace $workspace --message "Add project tracker"
aimoto version list --workspace $workspace
```

If you do not approve, the files remain yours but no version is created.

## 4. Restore without losing history

```powershell
$versions = aimoto version list --workspace $workspace --json | ConvertFrom-Json
$versionId = $versions.data.versions[0].versionId
aimoto version restore $versionId --workspace $workspace
```

Restore verifies the captured bytes and creates a new current version whose parent is the selected version. The earlier capture remains in history.

## Where to go next

- [CLI reference](manual/cli.md)
- [Operations and limits](manual/operations-and-limits.md)
- [Installed-product acceptance](acceptance.md)
