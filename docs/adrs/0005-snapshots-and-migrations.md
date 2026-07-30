# ADR-0005: Snapshots and migration semantics

- Status: Accepted
- Date: 2026-07-29

## Decision

Snapshots bind the workspace manifest, module digests and schemas, data,
context, event position, and engine configuration references. Schema migrations
run against copied current and representative historical data before activation.
Historical module bundles remain content-addressed.

## Consequences

Credentials stay outside snapshots. Failed or lossy migrations cannot touch the
active workspace, and restoration is validated as a proposed new revision.

