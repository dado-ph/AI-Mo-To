# Get started

This guide helps you try the part of AI-Mo-To that works today.

You will create a workspace called **My first workspace**, ask to change one
setting, approve that request, and confirm that the change happened. Nothing
is sent over the network. Everything stays in a folder on your computer.

## Before you begin

Open PowerShell in the AI-Mo-To repository. You need Node.js 22 or newer and
pnpm installed.

Install the project and build it once:

```powershell
pnpm install
pnpm build
```

## 1. Create a workspace

Choose a folder for the workspace. The following command creates a folder
called `my-first-workspace` beside this repository:

```powershell
$workspace = Join-Path (Get-Location) "my-first-workspace"
pnpm --filter @ai-mo-to/cli aimoto workspace create "My first workspace" --root $workspace
```

You should see something like this:

```text
My first workspace (my-first-workspace)
Revision: 0
Authority: suggest
Health: ok
```

What just happened? AI-Mo-To created a local folder, saved a small workspace
description, and started its history at revision `0`. No application settings
outside that folder were changed.

## 2. Ask for a change

Build mode is the setting that allows the workspace to prepare module and
workspace-composition changes. For now, it is the only setting change exposed
through the command line.

Run this command to prepare the change. It does **not** apply it yet:

```powershell
$plan = pnpm --filter @ai-mo-to/cli aimoto plan --workspace $workspace --set-authority build --json | ConvertFrom-Json
$plan.data
```

Read the output. Two values matter:

- `proposalId` identifies this particular request.
- `changeSetDigest` is a fingerprint of exactly what you are being asked to approve.

If the request changes, its fingerprint changes too. That is why you copy both
values from this response instead of typing them yourself.

## 3. Approve the exact request

This command applies the proposal you just reviewed:

```powershell
pnpm --filter @ai-mo-to/cli aimoto apply --workspace $workspace --proposal $plan.data.proposalId --hash $plan.data.changeSetDigest --json
```

The result should include `revision: 1` and `authorityMode: "build"`.

## 4. Check the result

```powershell
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace $workspace
```

You should now see:

```text
Revision: 1
Authority: build
Health: ok
```

You have completed the core loop: **prepare a change, inspect it, approve the
exact request, and keep a history of the result**.

## What is stored in the workspace?

Open the workspace folder if you are curious:

- `.aimoto/workspace.json` is the readable workspace description.
- `.aimoto/state.sqlite` stores the revision history, proposals, approvals, and events.
- `files` is where workspace files will live.
- `exports` is reserved for things the workspace produces.

You do not need to edit these files to follow this guide.

## What can I do next?

The command line is intentionally small at this stage. You can create,
inspect, plan, and approve the authority-mode example above.

For the exact command options and common errors, read the
[command reference](manual/cli.md). If you want to work on the code itself,
read the [technical API reference](manual/library-apis.md).

## What is not ready yet?

The repository already contains experiments for snapshots, generated modules,
and a module host. They are building blocks for contributors, not finished
commands for everyday users. There is no desktop interface yet, and there is
no command that generates or installs a Habit Tracker from a sentence.

