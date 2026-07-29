# Recovery and Capability Enforcement

## Goal

Make recovery and module authority observable, executable, and safe enough for
the product's first usable proof rather than leaving them as metadata and plans.

## Acceptance criteria

- A verified snapshot can be restored only as a new, approved workspace
  revision; invalid or stale recovery proposals cannot mutate state.
- Restore tests cover a changed active workspace and preserve prior revision
  history.
- Module capabilities are checked by the engine before host invocation.
- A denied capability and an authority-ceiling denial have stable error codes
  and leave workspace data unchanged.
- Snapshot and capability outcomes appear in the durable event history.
