# ADR-0002: Module host and trust tiers

- Status: Accepted
- Date: 2026-07-29

## Decision

Dynamic module handlers run in pinned active-LTS Node child processes and
request resources through typed engine brokers. Modules are classified as core,
local-generated, verified-community, or community, with progressively stricter
default capability treatment.

## Consequences

The child process is a fault boundary in v0.1. It becomes a security boundary
only when operating-system restrictions remove ambient resource access.

