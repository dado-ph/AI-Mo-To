# Operations and limits

AI-Mo-To keeps each workspace local and makes its changes reviewable. It is a trust boundary for workspace changes, not a replacement for ordinary backups, secret management, or operating-system sandboxing.

## What is in a workspace

Creating a workspace produces a normal folder with AI-Mo-To state under `.aimoto`:

```text
<workspace>/
  .aimoto/workspace.json
  .aimoto/state.sqlite
  .aimoto/context/
  .aimoto/modules/local/
  .aimoto/snapshots/
  files/
  exports/
```

The workspace manifest and SQLite state agree on the workspace identity and revision. Do not manually edit `.aimoto` files; use the CLI so the workspace remains valid.

## What AI-Mo-To guarantees

- A proposal is bound to one exact ChangeSet digest and one workspace revision.
- `apply` rejects proposals that are changed, stale, missing, or already applied.
- A snapshot is created before a workspace proposal is applied.
- Generated modules are re-hashed before they are copied into the workspace.
- Snapshot restoration is another proposal. It creates a new revision and preserves earlier history.

## What it does not guarantee

- A snapshot is not a full backup of every file in the workspace or of external credentials. Keep normal backups for files and exports.
- Module capability checks are enforced for engine-mediated calls, but the local module host is not an operating-system security sandbox.
- AI-Mo-To does not replace a secret manager. Snapshots reject `credentials` and `secrets` values, but you should still keep secrets outside workspace data.
- The desktop app currently focuses on opening and inspecting a workspace. Use the CLI for the complete proposal, approval, record-editing, and recovery flow.

## Working safely with an agent

When you use `aimoto request ... --agent`, the agent receives an isolated generated-app repository. Review the generated module, its requested capabilities, and the proposal digest before applying it. Approval to install a module is not approval to create or modify your personal records later.

Run `aimoto inspect --workspace <path>` after applying a change, and retain the entire workspace folder, including `.aimoto`, when you move or back it up.
