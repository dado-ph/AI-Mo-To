# Module Runtime Vertical Slice

## Goal

AI-Mo-To can validate and describe declarative modules, and can invoke an
optional dynamic handler through a supervised child-process host using framed
JSON-RPC without allowing diagnostic output to corrupt the protocol stream.

## User scenarios

1. The built-in Files and Tasks modules validate as data/view-only modules and
   expose coherent native views without shipping renderer code.
2. A generated module handler starts in a child process, completes an
   initialization handshake, receives an opaque `context_ref`, and returns a
   JSON-RPC result.
3. A handler crash, timeout, malformed frame, or protocol write on stdout is
   isolated to its host and reported with a stable host error.
4. Diagnostic output written to stderr is captured with a bounded size.

## Requirements

- Module manifests are validated before a handler is started.
- Data-only and view-only modules require no host process.
- Dynamic handlers communicate through `Content-Length` framed JSON-RPC 2.0.
- One frame contains one JSON object; unframed stdout is a protocol violation.
- Invocation parameters carry only an opaque `context_ref`, command name, and
  JSON-compatible input.
- Startup and invocation have deadlines; termination is idempotent.
- stderr is diagnostic-only and captured with a fixed upper bound.
- Native views use versioned declarations for forms, lists, tables, detail
  panels, timelines, actions, tabs, drawers, badges, and file pickers.
- The Node child process is documented and tested as a fault boundary, not an
  operating-system security boundary.

## Out of scope

Engine broker implementation, capability authorization, SQLite mutation,
desktop rendering, OS sandboxing, migrations, module installation, snapshots,
and arbitrary module-supplied frontend code.

## Acceptance criteria

- Framing tests cover split frames, multiple frames, invalid headers, and
  invalid JSON.
- Lifecycle tests cover successful startup/invocation, timeout, crash, bounded
  stderr, and termination.
- Files and Tasks manifests validate through the protocol module schema.
- View declarations contain only supported native primitives.

