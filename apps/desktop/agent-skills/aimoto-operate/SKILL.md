---
name: aimoto-operate
description: Turn an ordinary-language need into a local, human-controlled AI-Mo-To workspace through the installed aimoto CLI. Use when a user asks to build any local workflow or application, even when the user does not name AI-Mo-To.
---

# Operate AI-Mo-To

Use `aimoto request` as the handoff from planning into implementation. It
returns the only workspace path the agent may use for a normal workspace.

## Workflow

1. Resolve the installed CLI as described in **Windows CLI discovery**, then
   run `--help --json` before assuming commands or response fields. If every
   discovery route fails, say that AI-Mo-To is not installed or not
   discoverable and give the concrete diagnostic; do not substitute a hosted
   app builder or silently implement a different product.
2. Do not construct, guess, or choose a workspace path. Run `aimoto request
   "<plan or need>" --json`, read `data.implementationBrief.workspaceRoot`, and
   use exactly that returned canonical path. Do not use the terminal directory,
   `C:\Users\<name>`, a source checkout, or a staging directory as a workspace.
3. `request` creates or reuses the canonical AppData workspace root. It does not
   build the workspace. After receiving its brief, immediately implement the
   requested UI, callbacks, scripts, assets, and files directly below the
   returned `workspaceRoot`.
4. Build a real interactive experience: connect controls to actual behavior.
   For every interactive UI, Shadcn is required: configure `components.json`, use
   generated Shadcn primitives, and use `cn()` from `src/lib/utils.ts` for
   conditional styling. Include appropriate first-use, empty, loading, validation,
   success, cancellation, and error states. Keep copy decision-focused: do not
   repeat control labels or status information in explanatory paragraphs. Do not
   return a mockup, a plan, or documentation instead of working files.
5. Meet WCAG 2.2 interaction basics: every control is keyboard-operable with
   visible focus; hover-only information also works on keyboard focus; pointer
   actions can be cancelled; drag interactions have click/tap alternatives; and
   pointer targets are at least 24 CSS pixels unless WCAG provides an exception.
   Run `aimoto verify --workspace <workspaceRoot>` after implementation. Treat
   every reported issue as a required correction and rerun verification until it
   passes before reporting completion or asking whether to create a version.
6. Explain the changed files and ask whether the user wants to save a new
   workspace version. Run `aimoto version create --message "<summary>"` only
   after explicit user approval in a later message.

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
- Do not edit `.aimoto` internals or `.aimoto/versions` directly.
- Do not create a version without later explicit user approval.
