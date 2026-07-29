# AI-Mo-To Desktop

The desktop app is the installable, local entry point for AI-Mo-To. It opens a directory chooser, asks the workspace engine to inspect the selected directory, then shows the workspace name, trusted revision, installed-module count, and the Files and Tasks starting views.

## Run it

From the repository root, build the workspace and start the desktop app:

```powershell
pnpm build
pnpm --filter @ai-mo-to/desktop start
```

Choose a directory that was created with `aimoto workspace create`. The app only exposes workspace selection and inspection to its renderer; it does not grant the renderer Node.js or arbitrary IPC access.

## First launch and the default workspace

Today the app asks you to choose a workspace folder. The onboarding slice now
being developed changes first launch to open a useful default local workspace
without a project chooser: Files, Tasks, recent activity, and workspace
creation will be available before an AI engine is configured. Specific
workspaces will remain separately owned and selectable, while the installed
application remains shared.

## Build the Windows installer

From a clean, installed checkout on Windows, create the distributable installer:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @ai-mo-to/desktop dist
```

The installer is written to `apps/desktop/release/` as
`AI-Mo-To-Setup-<version>-<arch>.exe`. Running it offers a per-user install
location and creates the normal Windows application entry. Packaging never
publishes or uploads a release; that remains an explicit maintainer action.

The repository's `desktop-installer` GitHub Actions workflow performs this
same build on Windows and retains the installer as a workflow artifact for
review. It does not create a GitHub Release or publish an installer.

## One-time Electron install policy

Electron downloads its desktop runtime in its package install script. The
repository explicitly permits Electron's build script in `pnpm-workspace.yaml`;
run `pnpm install` before `start` or `dist` so the runtime is available.

That approval is deliberately narrow: it enables Electron only, while leaving other dependency build scripts blocked unless separately reviewed.

## Security boundary

Each renderer window is created with `contextIsolation: true` and `sandbox: true`. The preload bridge exposes only:

- `selectWorkspace()`
- `inspectWorkspace(root)`

All filesystem inspection remains in the main process through `WorkspaceEngine`.
