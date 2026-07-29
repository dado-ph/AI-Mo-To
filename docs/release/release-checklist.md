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

## 3. Smoke test the user workflow

Follow [Getting started](../getting-started.md) in a new, disposable folder.
Confirm that you can create a workspace, make a plan, approve it with the
displayed digest, and inspect the resulting revision. Do not use a real
workspace for this check.

## 4. Review the release change

- [ ] Review `git diff` against the previous release or selected baseline.
- [ ] Confirm no credentials, access tokens, local databases, or generated
  workspace data are included.
- [ ] Confirm GitHub Actions CI is green on Node 22 and Node 24.
- [ ] Record the tested commit SHA and the commands run in the release notes or
  pull request.

## 5. Publish only with explicit authorization

Publishing is not part of this repository's local release procedure. After all
checks pass, a maintainer may use the approved distribution process for that
release target. Never infer publishing credentials or publish as part of a
validation run.
