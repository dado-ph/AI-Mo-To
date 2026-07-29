# Operations, trust, and limits

## Workspace layout

Creating a workspace produces:

```
<root>/
  .aimoto/workspace.json       validated workspace manifest
  .aimoto/state.sqlite         SQLite state (WAL mode)
  .aimoto/context/
  .aimoto/modules/local/
  .aimoto/snapshots/
  files/
  exports/
```

The engine checks that the manifest and database agree on workspace ID and
revision. Do not manually edit one without the other; inspection will fail.
SQLite keeps revision, event, proposal, and approval records. The manifest
write is atomic at the file level, but do not treat this early implementation
as a substitute for ordinary filesystem backups.

## Trust and integrity

An approval is not a broad permission: it binds one exact canonical ChangeSet
digest and base revision. If the workspace changes first, the proposal becomes
stale. For generated local modules, the engine re-hashes the staged directory
before copying it to `.aimoto/modules/local/<digest>` and refuses mismatch.

Foundry rejects unsafe or duplicate bundle paths and staged symbolic links.
Snapshots explicitly reject inputs containing `credentials` or `secrets`; they
record credential *binding keys* only. This is not a full secret-management or
sandboxing system. Review generated module code and its requested capabilities
before approving it.

Recovery is also an approval operation. `snapshot restore-propose` verifies the
snapshot, binds its ID and captured workspace-manifest digest into a pending
ChangeSet, and leaves the current workspace alone. `apply` writes the captured
workspace configuration as the next revision only when that exact proposal and
its base revision still match. Earlier revisions remain in SQLite's revision
history; recovery is not a database rollback.

## Current boundaries

- The installable desktop app opens a selected workspace and shows its trusted
  revision and starting Files and Tasks views. It does not yet provide the
  complete graphical proposal, approval, record-editing, or recovery flow.
- The CLI can stage the built-in local Habit Tracker, create and inspect
  snapshots, and prepare a restore proposal. `apply` remains the only command
  that commits an approved workspace change.
- Snapshot recovery restores the captured workspace configuration, not a full
  filesystem backup or external credentials. Keep ordinary backups for files
  and exports.
- Generic Foundry integrations require caller-provided selector, generator,
  validator, and activator hooks. The built-in Habit Tracker flow is a local,
  deterministic reference generator, not a model provider or module registry.
- Engine-mediated module calls enforce workspace capability grants and their
  authority ceiling. The module host still supervises a local Node child
  process; it is not an operating-system security sandbox.

Run `pnpm validate` after changes. For operational review, inspect the generated
JSON proposal and digest before calling `apply`, and retain the workspace root
including `.aimoto` when moving or backing it up.
