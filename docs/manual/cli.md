# CLI guide

The `aimoto` CLI manages local, agent-implemented workspaces. It separates asking for an implementation from approving a durable filesystem version.

## Run the CLI

After installing the Windows app, run `aimoto ...`. From a repository checkout:

```powershell
pnpm --filter @ai-mo-to/cli aimoto --help
```

Add `--json` for one versioned JSON envelope on standard output.

## Implementation flow

```powershell
$workspace = "./my-workspace"

aimoto workspace create "My Workspace" --root $workspace
$handoff = aimoto request "Create a project tracker with a weekly view" --workspace $workspace --json | ConvertFrom-Json
```

`$handoff.data.implementationBrief` tells the coding agent what to implement and gives it the canonical workspace root. `request` does not classify the text, choose a module, invoke another agent, implement files, or create a version. The agent works directly beneath `implementationBrief.workspaceRoot` and continues until the requested UI and functions work.

Once the implementation has been verified, the agent asks the user whether to capture a version. `version create` runs only after explicit user confirmation:

```powershell
aimoto version create --workspace $workspace --message "Add weekly project tracker" --json
```

The message is required and should summarize the user-approved state. Calling `request` alone leaves `version list` empty.

## Commands

```text
aimoto init "<name>" [--root <path>] [--json]
aimoto workspace create "<name>" [--root <path>] [--json]
aimoto request "<plan or need>" --workspace <path> [--json]
aimoto inspect [--workspace <path>] [--json]
aimoto version create --workspace <path> --message "<user-approved summary>" [--json]
aimoto version list --workspace <path> [--json]
aimoto version restore <version-id> --workspace <path> [--json]
aimoto doctor [--workspace <path>] [--json]
aimoto open [--workspace <path>] [--json]
```

`init` is an alias for `workspace create`. When `--workspace` is omitted, commands first use `AIMOTO_WORKSPACE`, then the nearest ancestor workspace, then the registered default where supported.

## Versions and recovery

List captured versions:

```powershell
aimoto version list --workspace $workspace --json
```

Restore one as a new version:

```powershell
aimoto version restore <version-id> --workspace $workspace --json
```

Restore writes the selected captured files back to the workspace, retains earlier versions, and records the restored state with the selected version as its parent.

## Common errors

| Error | Meaning | What to do |
| --- | --- | --- |
| `WorkspaceNotFound` | The folder is not an AI-Mo-To workspace. | Create a workspace or use the right path. |
| `InvalidInput` | A required need, message, action, or version ID is missing. | Check `aimoto --help` and retry with the required argument. |
| `ValidationFailed` | Workspace metadata or captured content is invalid. | Inspect the workspace and choose a verified version if restoring. |

Use `aimoto --help --json` before a program or coding agent assumes a command or response field.
