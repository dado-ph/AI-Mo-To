# Releasing AI-Mo-To

This folder contains the repeatable release process. A release is a reviewed,
validated source revision; do not publish packages, archives, or installers
until the checklist in [release-checklist.md](release-checklist.md) is complete.

For the Windows desktop product, a release candidate includes a reproducible
NSIS installer. Build it locally with:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @ai-mo-to/desktop dist
```

The output is `apps/desktop/release/AI-Mo-To-Setup-<version>-<arch>.exe`.
The `desktop-installer` workflow builds the same artifact on Windows for pull
requests and `main`, then retains it only as a CI artifact. It does not
publish a release.

The project does not currently automate publishing. That is intentional: a
maintainer must explicitly choose distribution targets and credentials when
release automation is introduced.
