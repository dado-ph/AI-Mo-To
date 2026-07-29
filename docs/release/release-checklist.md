# Local release checklist

Use this checklist from a clean checkout of the release commit. It makes the
pre-release verification reproducible without publishing anything.

## 1. Confirm the candidate

- [ ] The branch is up to date with the intended release commit.
- [ ] `git status --short` shows no local changes.
- [ ] The version and release notes are intentionally prepared (when versioning
  is introduced).
- [ ] User-facing documentation matches the candidate's behavior and known
  limitations.

## 2. Install exactly what CI will install

Use Node.js 22 or 24 and pnpm 11.9.0:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

Both commands must succeed. `--frozen-lockfile` proves that the committed lock
file is complete; `pnpm validate` builds all workspaces and runs their tests.

## 3. Build and inspect the Windows installer

On Windows, build the installable desktop artifact:

```powershell
pnpm --filter @ai-mo-to/desktop dist
```

- [ ] `apps/desktop/release/AI-Mo-To-Setup-<version>-<arch>.exe` exists.
- [ ] Install it in a disposable per-user location and launch **AI-Mo-To**.
- [ ] Confirm the installed app can select and inspect a disposable workspace.
- [ ] Confirm the installer was produced by the reviewed commit; do not treat
  a locally modified build as a release candidate.

## 4. Smoke test the user workflow

Follow [Getting started](../getting-started.md) in a new, disposable folder.
Confirm that you can create a workspace, request a Habit Tracker, approve it
with the displayed digest, inspect the resulting revision, create a snapshot,
and verify its digest. Do not use a real workspace for this check.

## 5. Review the release change

- [ ] Review `git diff` against the previous release or selected baseline.
- [ ] Confirm no credentials, access tokens, local databases, or generated
  workspace data are included.
- [ ] Confirm GitHub Actions CI is green on Node 22 and Node 24.
- [ ] Confirm the `desktop-installer` GitHub Actions workflow is green and its
  retained Windows installer artifact matches the candidate version.
- [ ] Record the tested commit SHA and the commands run in the release notes or
  pull request.

## 6. Publish only with explicit authorization

Publishing is not part of this repository's local release procedure. After all
checks pass, a maintainer may use the approved distribution process for that
release target. Never infer publishing credentials or publish as part of a
validation run.
