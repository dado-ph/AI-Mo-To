# AI-Mo-To CLI

`aimoto` creates a local workspace, returns an implementation brief to a coding agent, and records filesystem versions only after explicit user approval.

## Create a workspace and request an implementation

```powershell
aimoto workspace create "My Workspace" --root ./my-workspace
aimoto request "Create a project tracker with a weekly view" --workspace ./my-workspace
```

`request` does not classify the need, generate or install a module, change application files, or create a version. Its JSON envelope contains `data.implementationBrief`, including the canonical workspace root, the requested outcome, and the implementation instructions. The coding agent implements directly beneath that root.

## Capture an approved version

After the implementation works, the agent must ask the user whether to capture it. Only after the user explicitly confirms should the agent run:

```powershell
aimoto version create --workspace ./my-workspace --message "Add weekly project tracker"
```

List or restore versions with:

```powershell
aimoto version list --workspace ./my-workspace
aimoto version restore <version-id> --workspace ./my-workspace
```

Restoring a capture preserves version history and records the restored state as a new version.

Use `aimoto --help --json` for the machine-readable command contract, or see the [full CLI guide](../../docs/manual/cli.md).
