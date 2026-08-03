# AI-Mo-To Desktop

AI-Mo-To Desktop is the local visual entry point for a workspace. It opens a workspace, shows its trusted revision and installed surfaces, and connects people to the same review-and-apply workflow used by the CLI.

The `aimoto` CLI remains the complete interface for creating workspaces, preparing proposals, applying reviewed changes, and recovering snapshots.

## Run from this repository

```powershell
pnpm build
pnpm --filter @ai-mo-to/desktop start
```

Open a folder created with `aimoto workspace create`.

## Build the Windows installer

```powershell
pnpm install --frozen-lockfile
pnpm --filter @ai-mo-to/desktop dist
```

The installer is written to `apps/desktop/release/` as `AI-Mo-To-Setup-<version>-<arch>.exe`. It installs the `aimoto` launcher and the `aimoto-operate` skill for Codex when its skills directory is available.

The desktop installer workflow builds this package for review; publishing a GitHub release remains a separate maintainer action.

## Trust boundary

The renderer is sandboxed and uses context isolation. Filesystem inspection and workspace operations stay in the main process through the workspace engine. The desktop does not give its renderer direct Node.js or arbitrary IPC access.
