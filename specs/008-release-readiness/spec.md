# Release Readiness Vertical Slice

## Goal

Give contributors and maintainers a small, repeatable path to validate changes,
report security issues safely, and prepare a release without publishing.

## Requirements

- Pull requests and pushes to `main` run a clean pnpm install and validation on
  supported Node LTS lines (22 and 24).
- Pull requests and pushes to `main` build the Windows desktop installer and
  retain it as a reviewable workflow artifact without publishing it.
- Contributors have one concise guide for setup, validation, pull requests, and
  documentation expectations.
- Security-sensitive reports have a private, documented reporting path.
- Maintainers have a reproducible local checklist that distinguishes validation
  from publishing.
- GitHub issue and pull request templates collect the information reviewers
  need without requiring product knowledge.

## Out of scope

Package publishing, signing, release-note generation, versioning automation,
and external credential setup.

## Acceptance criteria

- The CI workflow uses `pnpm install --frozen-lockfile` followed by `pnpm validate`.
- A Windows workflow creates the NSIS installer and uploads the generated
  executable as an artifact without creating a release.
- The local checklist can be completed from a clean checkout using Node 22 or 24.
- Security guidance directs reports away from public issues.
