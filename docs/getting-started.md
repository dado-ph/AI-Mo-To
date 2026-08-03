# Get started with AI-Mo-To

AI-Mo-To is a local workspace that you can shape with the `aimoto` CLI or with a CLI coding agent such as Codex. You describe what you need, inspect the proposed change, and decide whether to apply it. The workspace remains yours throughout.

## Before you start

Use one of these paths:

- **Windows app:** install AI-Mo-To Desktop on Windows x64. The installer also makes the `aimoto` command available.
- **From source:** use Node.js 22 or later and pnpm 11 or later, then run `pnpm install` and `pnpm build` from this repository.

After installation, confirm that the CLI is available:

```powershell
aimoto --help
```

## 1. Create a workspace

Choose a folder that you want AI-Mo-To to manage. This example creates one in your Documents folder:

```powershell
$workspace = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "AI-Mo-To\Workspaces\My-Workspace"
aimoto workspace create "My Workspace" --root $workspace
```

The workspace starts with Files and Tasks, a local revision history, and the default `suggest` authority mode. You can inspect it at any time:

```powershell
aimoto inspect --workspace $workspace
```

## 2. Shape the workspace

### Ask AI-Mo-To directly

Use `request` to ask for a local tool or workflow. It prepares a proposal but does not install anything.

```powershell
$review = aimoto request "Help me track meditation every day" --workspace $workspace --json | ConvertFrom-Json
```

Read the plan, requested capabilities, and exact digest in `$review` before continuing.

### Ask a CLI coding agent

If Codex CLI is installed, you can ask it in plain language to build a workspace feature with AI-Mo-To. Under the hood, the agent uses the same `request` flow with `--agent`; it works in an isolated generated-app repository, not in the trusted workspace itself.

```powershell
aimoto request "Create a local project tracker with tasks, due dates, and a weekly view" --workspace $workspace --agent
```

The agent's result is still only a proposal. Review it before applying it.

## 3. Review and apply

Every proposal includes an ID and a SHA-256 digest. Applying requires both values, so the applied change is the one you reviewed.

```powershell
$proposalId = $review.data.proposal.proposalId
$digest = $review.data.proposal.changeSetDigest
aimoto apply --workspace $workspace --proposal $proposalId --hash $digest --json
```

Then inspect the workspace again:

```powershell
aimoto inspect --workspace $workspace
```

AI-Mo-To creates a recovery snapshot before it applies a workspace change. A changed workspace revision makes an earlier proposal stale, so it cannot be applied by accident.

## Authority modes

Workspaces use five authority modes: `observe`, `suggest`, `assist`, `execute`, and `build`. The default is `suggest`. Changing a mode is itself a proposed change:

```powershell
$modeChange = aimoto plan --workspace $workspace --set-authority build --json | ConvertFrom-Json
aimoto apply --workspace $workspace --proposal $modeChange.data.proposalId --hash $modeChange.data.changeSetDigest --json
```

Use `build` only when you need to stage or install a custom module. The CLI will show the exact effects before you apply the proposal.

## Recover a workspace

You can also create a snapshot whenever you want a named recovery point:

```powershell
$snapshot = aimoto snapshot create --workspace $workspace --json | ConvertFrom-Json
aimoto snapshot inspect $snapshot.data.snapshotId --workspace $workspace
```

Restoring a snapshot first creates another proposal. It does not overwrite history or change the workspace until you review and apply that proposal.

## Where to go next

- [CLI guide](manual/cli.md) for every command and its arguments.
- [Operations and limits](manual/operations-and-limits.md) for the current trust and product boundaries.
- [Module development](manual/module-development.md) if you are extending the platform.
