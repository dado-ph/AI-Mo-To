# ADR-0003: Capability protocol and causality

- Status: Accepted
- Date: 2026-07-29

## Decision

The engine owns causality and authority state. A module receives only an opaque,
channel-bound context reference and submits typed operations to brokers. The
engine derives effects and reversibility, binds approval to the canonical
ChangeSet hash, and enforces monotonic authority ceilings across child calls.

## Consequences

Modules cannot self-declare their effective authority. Stale revisions,
precondition failures, and expanded effect sets require revalidation and a new
approval.

