# Desktop Shell

## Goal

Provide a local Electron shell that lets a person select an existing AI-Mo-To workspace and inspect its trusted state.

## Acceptance criteria

- The main process selects directories and calls `WorkspaceEngine.inspectWorkspace`.
- The preload exposes only `selectWorkspace` and `inspectWorkspace` through an allow-listed typed API.
- Renderer windows use `contextIsolation: true` and `sandbox: true`.
- The initial renderer model provides Files and Tasks native views, including useful empty states.
- The slice is testable without a running Electron binary.
