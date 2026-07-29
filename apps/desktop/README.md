# AI-Mo-To Desktop

The desktop app is the local, secure entry point for an existing AI-Mo-To workspace. It opens a directory chooser, asks the workspace engine to inspect the selected directory, then shows the workspace name, trusted revision, installed-module count, and the Files and Tasks starting views.

## Run it

From the repository root, build the workspace and start the desktop app:

```powershell
pnpm build
pnpm --filter @ai-mo-to/desktop start
```

Choose a directory that was created with `aimoto workspace create`. The app only exposes workspace selection and inspection to its renderer; it does not grant the renderer Node.js or arbitrary IPC access.

## One-time Electron install policy

Electron downloads its signed desktop runtime in its package install script. This repository intentionally blocks unapproved dependency install scripts, so the repository-level `pnpm-workspace.yaml` must explicitly set `allowBuilds.electron: true`, followed by `pnpm install`, before `start` can launch a window. Without that approval, the TypeScript app still builds and its contract tests pass, but Electron has no downloaded executable to start.

That approval is deliberately narrow: it enables Electron only, while leaving other dependency build scripts blocked unless separately reviewed.

## Security boundary

Each renderer window is created with `contextIsolation: true` and `sandbox: true`. The preload bridge exposes only:

- `selectWorkspace()`
- `inspectWorkspace(root)`

All filesystem inspection remains in the main process through `WorkspaceEngine`.
