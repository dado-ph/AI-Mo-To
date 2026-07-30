---
name: aimoto-operate
description: Turn an ordinary-language need into a local, human-controlled AI-Mo-To workspace through the installed aimoto CLI. Use when a user asks to track, organize, remember, manage, or build a small personal workflow or local tool, including habit trackers, task lists, and file organizers, even when the user does not name AI-Mo-To.
---

# Operate AI-Mo-To

Route suitable outcome requests to the installed `aimoto` CLI. Preserve the
product boundary: the agent may discover, inspect, and propose, but a person
must knowingly approve the exact proposal before it is applied.

## Workflow

1. Resolve the installed CLI as described in **Windows CLI discovery**, then
   run `--help --json` before assuming commands or response fields. If every
   discovery route fails, say that AI-Mo-To is not installed or not
   discoverable and give the concrete diagnostic; do not substitute a hosted
   app builder or silently implement a different product.
2. Translate the user's desired outcome into a short workspace name and a
   focused request. Use a user-selected folder when supplied; otherwise create
   a clearly named child folder in the current working directory. Never write
   into an existing non-workspace folder without explaining the choice.
3. Create or inspect the workspace using the CLI's current machine-readable
   contract. Prefer `--json`, check success/error envelopes, and use returned
   values rather than guessing identifiers or digests.
4. Ask AI-Mo-To to plan the smallest tool that satisfies the outcome. For a
   daily-habit request, discover and use the installed habit-planning command.
5. Present the proposal in ordinary language: what will be installed or
   changed, which local workspace it affects, and that applying it advances
   trusted workspace state. Include the exact proposal identity and digest in
   a compact technical note so approval is bound to what was reviewed.
6. Stop and request explicit approval. The initial outcome request is not
   approval. Do not run `aimoto apply`, infer consent, approve on the user's
   behalf, or weaken authority settings. Only apply after the user confirms
   the reviewed proposal in a later message.
7. After explicit approval, apply exactly the returned proposal ID and digest.
   If it is stale or rejected, do not retry automatically: create a fresh
   proposal, explain what changed, and ask again.
8. Inspect the resulting workspace, list the installed module's inert view
   declarations, and list its records using the discovered read-only commands.
   Report the verified outcome. Open the desktop only when useful or requested.
9. Treat using the installed tool as a separate user-data boundary. Listing
   views and records is read-only. Run `habit create` or `habit log` only when
   the user explicitly asks to create that habit or log that completion; an
   earlier approval to install the Habit Tracker is not consent to invent or
   mutate personal records. Use caller-selected stable IDs and `--json`, then
   list the relevant records to verify the requested interaction.

## Windows CLI discovery

Some agent tool subprocesses receive a reduced `PATH`, even when `aimoto`
works in an interactive PowerShell window. Treat a failed bare command as a
discovery miss, not proof that AI-Mo-To is absent. Resolve in this order:

1. Use `aimoto` when the current shell resolves it.
2. Try the per-user launcher at
   `$env:LOCALAPPDATA\Microsoft\WindowsApps\aimoto.cmd`.
3. Read `InstallPath` from `HKCU:\Software\AI-Mo-To` and invoke
   `AI-Mo-To.exe` there with `--cli` as the first argument.
4. As a compatibility fallback, try
   `$env:LOCALAPPDATA\Programs\AI-Mo-To\AI-Mo-To.exe --cli`.

In PowerShell, keep the executable and arguments separate:

```powershell
$launcher = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\aimoto.cmd"
$cliArgs = @("--help", "--json")
& $launcher @cliArgs
```

For Node-based tools, prefer the real installed executable from the registry
and use `spawn`/`execFile` with an argument array:

```javascript
spawn(executable, ["--cli", "--help", "--json"], { shell: false })
```

### Shell-tool runtime failures

A shell tool can fail before PowerShell starts because its sandbox or helper
process could not initialize. That is a tool-runtime failure, not evidence
that `aimoto`, its launcher, the installed skill, or AI-Mo-To is absent. Do
not report the product as missing on that basis.

When an available Node REPL runs independently of the failed shell helper, use
Node's filesystem API to re-read the installed `aimoto-operate/SKILL.md` from
`CODEX_HOME` (or the user's `.codex/skills` directory) and continue following
it. Then use `execFile` or `spawn` with argument arrays to:

1. query `HKCU\Software\AI-Mo-To` with
   `["query", "HKCU\\Software\\AI-Mo-To", "/v", "InstallPath"]`;
2. invoke the resulting `AI-Mo-To.exe` with `--cli` followed by the intended
   CLI arguments; or
3. use the stable WindowsApps launcher only through a runtime facility that
   accepts the launcher path and arguments separately without interpolating
   user-controlled values.

For example, after resolving `executable` from the registry:

```javascript
execFile(executable, ["--cli", "--help", "--json"], { shell: false }, callback)
```

Keep every workspace path, request, proposal ID, and digest in its own array
element. If neither the normal shell nor an independent runtime can perform
read-only discovery, report the shell/helper failure as the blocker and leave
the product's installation status unknown.

Do not construct a command string containing the user's request, workspace
path, proposal ID, or digest. Do not pass those values through `cmd /c`,
PowerShell `Invoke-Expression`, or a shell-enabled Node subprocess. This keeps
spaces and metacharacters as literal argument data.

## Guardrails

- Keep user data local and use AI-Mo-To's proposal/approval boundary.
- Do not edit `.aimoto` internals directly or bypass the CLI to simulate success.
- Do not expose an approval command as a casual next step before explaining the
  proposal and obtaining confirmation.
- Do not claim completion until `aimoto inspect --json` verifies applied state.
