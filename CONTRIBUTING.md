# Contributing to AI-Mo-To

Thanks for helping improve AI-Mo-To. This repository is a pnpm TypeScript
monorepo. The fastest way to make a safe contribution is to start small,
test it locally, and describe the behavior change in your pull request.

## Set up

Install Node.js 22 or 24 and enable Corepack, then run:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

`pnpm validate` builds every workspace and runs the test suite. Run it before
opening a pull request. Do not manually edit `pnpm-lock.yaml`; let pnpm update
it when a dependency change is intentional.

## Make a change

1. Create a branch from `main`.
2. Keep the change focused on one user outcome.
3. Add or update tests when behavior changes.
4. Update the relevant guide in `docs/` when a command, API, or workflow
   changes.
5. Run `pnpm validate` and open a pull request using the template.

Changes that affect workspace state, ChangeSets, approvals, module execution,
snapshots, the desktop interface, or installer packaging should also document
their compatibility, recovery, and user-facing impact. Keep the product
boundary clear: this repository builds AI-Mo-To, while the installed desktop
app is what ordinary users run.

## Pull request expectations

Explain what a user can now do, how you verified it, and any limitations. Keep
generated files, credentials, local databases, and private workspace contents
out of commits. Maintainers may ask for a smaller change or an explicit
migration path before merging.

## Reporting problems

Use the bug report template for reproducible defects and the feature template
for product ideas. For a security issue, follow [SECURITY.md](SECURITY.md)
instead of creating a public issue.
