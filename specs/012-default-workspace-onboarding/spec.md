# Default Workspace Onboarding

## Goal

Make the installed application useful on its first launch: it creates and opens
one stable local workspace without asking the person to find or create one.

## Acceptance criteria

- The desktop derives a deterministic default root beneath Electron `userData`.
- First launch creates the default workspace with the normal engine path; later
  launches inspect and reopen the same workspace without replacing it.
- The renderer opens that default workspace on startup and still permits a
  person to select another existing workspace.
- The default workspace IPC endpoint is explicitly allow-listed and retains
  context isolation and sandboxing.
- Tests cover path determinism, first-run creation, and subsequent reuse.
