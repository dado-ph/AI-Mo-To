# ADR-0006: Proof-of-concept acceptance standard

- Status: Accepted
- Date: 2026-07-29

## Decision

The first proof is one workspace with Files and Tasks into which an external
coding agent generates and installs a Habit Tracker without manual code edits.
The proof must cover staging, validation, dry activation, exact-digest approval,
transactional commit, stale-proposal rejection, host failure, snapshot
restoration, and versioned JSON CLI output.

## Consequences

Multi-engine routing, a public registry, cross-device sync, WASI hosting, and
core self-updates remain outside v0.1 until this loop passes.

