# ADR-0004: Module and view contracts

- Status: Accepted
- Date: 2026-07-29

## Decision

A module statically declares identity, collections, commands, events,
capabilities, migrations, and native views. The desktop renderer owns the view
implementation; modules provide declarations and optional handlers rather than
arbitrary renderer bundles.

## Consequences

Data-only and view-only modules remain possible. Renderer primitives evolve
through versioned contracts and preserve a coherent application surface.

