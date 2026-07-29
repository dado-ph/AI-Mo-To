# Records and Commands Vertical Slice

## Goal

Make the default Files and Tasks modules useful: records must persist locally,
reject invalid writes, retain an audit event, and protect people from silently
overwriting a newer record.

## Requirements

- Storage owns module and collection-scoped records in the workspace database.
- Create, read, list, update, and delete operations are durable and use
  caller-provided validation before mutation.
- Updates and deletes require the record version the caller inspected.
- Files exposes register/remove commands; Tasks exposes create/update/complete/
  reopen commands in its module contract.
- The fixture and test model a small household workflow, not a synthetic key/
  value example.

## Out of scope

Rendering, IPC routing, permissions decisions, and engine command dispatch.

## Acceptance criteria

- Reopening the database returns the same records.
- A stale update returns `VersionConflict` and does not overwrite data.
- Invalid task data is rejected by the supplied module validator.
