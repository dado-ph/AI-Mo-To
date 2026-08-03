# CLI guide

The `aimoto` CLI manages local AI-Mo-To workspaces. A request prepares a proposal; it never approves or applies it. A person reviews the proposal, then applies the exact proposal ID and SHA-256 digest.

## Run the CLI

After installing the Windows app, run `aimoto ...`. From a repository checkout, run commands through pnpm:

```powershell
pnpm --filter @ai-mo-to/cli aimoto --help
```

Add `--json` when a script or coding agent needs a machine-readable response. JSON output is a single versioned envelope on standard output.

## The normal flow

```powershell
$workspace = "./my-workspace"

# Create and inspect a workspace.
aimoto workspace create "My Workspace" --root $workspace
aimoto inspect --workspace $workspace

# Prepare a change. This does not change the trusted workspace.
$review = aimoto request "Help me track meditation every day" --workspace $workspace --json | ConvertFrom-Json

# Review $review.data.plan and $review.data.proposal before continuing.
$proposalId = $review.data.proposal.proposalId
$digest = $review.data.proposal.changeSetDigest

# Apply only the reviewed proposal and digest.
aimoto apply --workspace $workspace --proposal $proposalId --hash $digest --json
aimoto inspect --workspace $workspace
```

For a coding-agent-generated feature, add `--agent` to `request`. This uses the configured Codex CLI provider to work in an isolated generated-app repository. The generated result still follows the same review and `apply` step.

```powershell
aimoto request "Create a project tracker with a weekly view" --workspace $workspace --agent
```

## Commands

```text
aimoto init "<name>" [--root <path>] [--json]
aimoto workspace create "<name>" [--root <path>] [--json]
aimoto doctor [--workspace <path>] [--json]
aimoto inspect [--workspace <path>] [--json]
aimoto request "<ordinary need>" --workspace <path> [--agent] [--json]
aimoto plan --workspace <path> --set-authority <mode> [--json]
aimoto apply --workspace <path> --proposal <id> --hash <sha256:digest> [--principal <id>] [--json]
aimoto snapshot create [--workspace <path>] [--json]
aimoto snapshot list [--workspace <path>] [--json]
aimoto snapshot inspect <snapshot-id> [--workspace <path>] [--json]
aimoto snapshot restore-plan <snapshot-id> [--workspace <path>] [--json]
aimoto snapshot restore-propose <snapshot-id> [--workspace <path>] [--json]
aimoto module views --module <id> [--workspace <path>] [--json]
aimoto records list --module <id> [--collection <id>] [--workspace <path>] [--json]
aimoto open [--workspace <path>] [--json]
```

`init` is an alias for `workspace create`. `inspect`, `plan`, and `apply` use the current directory as their workspace when `--workspace` is omitted.

## Authority modes

The supported modes are `observe`, `suggest`, `assist`, `execute`, and `build`. A new workspace starts in `suggest` mode. Mode changes use the same proposal-and-apply flow as other workspace changes:

```powershell
$modeChange = aimoto plan --workspace $workspace --set-authority build --json | ConvertFrom-Json
aimoto apply --workspace $workspace --proposal $modeChange.data.proposalId --hash $modeChange.data.changeSetDigest
```

## Snapshots and recovery

AI-Mo-To creates a snapshot before applying a workspace proposal. You can also create a snapshot yourself:

```powershell
$snapshot = aimoto snapshot create --workspace $workspace --json | ConvertFrom-Json
aimoto snapshot inspect $snapshot.data.snapshotId --workspace $workspace
```

To restore one, first create and review a restoration proposal:

```powershell
$restore = aimoto snapshot restore-propose $snapshot.data.snapshotId --workspace $workspace --json | ConvertFrom-Json
aimoto apply --workspace $workspace --proposal $restore.data.proposalId --hash $restore.data.changeSetDigest
```

Recovery creates a new revision and retains the earlier revision history. A proposal becomes stale if the workspace changes before you apply it.

## Common errors

| Error | Meaning | What to do |
| --- | --- | --- |
| `WorkspaceNotFound` | The folder is not an AI-Mo-To workspace. | Create a workspace or use the right path. |
| `ProposalStale` | The workspace changed after the proposal was made. | Make and review a new proposal. |
| `ProposalNotFound` | The proposal ID is not in this workspace. | Use the ID from the current review. |
| `ValidationFailed` | The digest, proposal, or module contract did not validate. | Use the exact returned digest and create a fresh proposal if needed. |

Use `aimoto --help --json` before a program or coding agent assumes a command or response field.
