# Get started with AI-Mo-To

AI-Mo-To is an installed Windows application that keeps small, local
workspaces in one place. The application is what you use day to day; this
repository is only needed when building the application from source or using
its structured command-line interface.

## Open the installed app

Install AI-Mo-To from the Windows installer, then open **AI-Mo-To** from the
Start menu. The current desktop app asks you to choose a workspace folder. If
you already have one, select its folder and the app will show its name, trusted
revision, installed modules, and Files and Tasks starting views.

The next onboarding slice makes first launch simpler: AI-Mo-To will open a
useful default local workspace immediately, with Files, Tasks, recent activity,
and workspace creation available before an AI engine is configured. Specific
workspaces will remain separately owned and selectable from the shared app.

Until that slice lands, create your first workspace with the short local
workflow below.

## Create your first workspace

Open PowerShell in a built source checkout. You need Node.js 22 or newer and
pnpm. Install and build once:

```powershell
pnpm install
pnpm build
```

Create a folder called `my-first-workspace` beside the repository:

```powershell
$workspace = Join-Path (Get-Location) "my-first-workspace"
pnpm --filter @ai-mo-to/cli aimoto workspace create "My first workspace" --root $workspace
```

You should see a local workspace at revision `0`, with the built-in Files and
Tasks modules. Select this folder in the installed desktop app whenever you
want to inspect it.

## Ask for a Habit Tracker

The first agent-driven proof is intentionally local and inspectable. It does
not use an account, API key, or network request. Your request is passed to a
deterministic reference generator that prepares a Habit Tracker with habits,
daily check-ins, and completion history.

```powershell
$plan = pnpm --filter @ai-mo-to/cli aimoto agent habit plan --workspace $workspace --request "Track meditation every day" --json | ConvertFrom-Json
$plan.data.plan
```

Read the plan before continuing. Two values bind your approval to this exact
proposal:

- `proposalId` identifies this installation request.
- `changeSetDigest` is the fingerprint of the exact change you reviewed.

Approve it only when the plan, requested capabilities, and module details make
sense to you:

```powershell
pnpm --filter @ai-mo-to/cli aimoto apply --workspace $workspace --proposal $plan.data.proposal.proposalId --hash $plan.data.proposal.changeSetDigest --json
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace $workspace
```

The inspection should show a later revision and three modules: Files, Tasks,
and the Habit Tracker. If the workspace changes before approval, the proposal
is stale and you must create and review a new one.

## Save a verified recovery point

Create a snapshot before later structural changes:

```powershell
$snapshot = pnpm --filter @ai-mo-to/cli aimoto snapshot create --workspace $workspace --json | ConvertFrom-Json
pnpm --filter @ai-mo-to/cli aimoto snapshot inspect $snapshot.data.snapshotId --workspace $workspace --json
```

Recovery has a deliberate boundary. `snapshot restore-plan` explains what a
recovery would change and changes nothing. `snapshot restore-propose` creates a
pending proposal. Only `apply` with that proposal's exact digest restores the
captured workspace configuration as a new revision. It never silently rolls
back the old history.

## Build the installer from source

If you are building AI-Mo-To rather than using a provided installer, create the
Windows NSIS package with:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @ai-mo-to/desktop dist
```

The installer is written to `apps/desktop/release/`. Run it to install
AI-Mo-To for the current Windows user.

## Current boundaries

The desktop app currently opens and inspects a selected workspace; the full
graphical proposal, approval, record-editing, and recovery experience is still
being developed. Snapshot recovery covers workspace configuration, not arbitrary
files, exports, or external credentials, so keep ordinary backups as well.

For every command and its error handling, read the [command reference](manual/cli.md).
For installer and desktop details, read the [desktop guide](../apps/desktop/README.md).
