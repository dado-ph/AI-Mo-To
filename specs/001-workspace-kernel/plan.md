# Plan

## Architecture

- `@ai-mo-to/storage` owns the reference layout, atomic manifest writes, SQLite
  schema, revision log, and event log.
- `@ai-mo-to/engine` validates manifests and coordinates storage.
- `@ai-mo-to/cli` parses entry-surface commands and renders human or JSON output.
- `@ai-mo-to/protocol` remains the shared contract authority.

## Implementation sequence

1. Create the workspace storage schema and layout helpers.
2. Implement engine creation and inspection.
3. Expose both operations through the CLI.
4. Test direct engine use and CLI equivalence.
5. Run repository validation and a real command smoke test.

## Risk controls

- Existing manifests block creation before mutation.
- SQLite creation uses an immediate transaction.
- Manifest writes use a temporary file and atomic rename.
- Inspection compares the file manifest with authoritative database metadata.
- CLI errors are normalized without leaking unexpected internal errors.

