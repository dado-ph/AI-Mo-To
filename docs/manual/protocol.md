# Protocol and approval model

The `@ai-mo-to/protocol` package exports TypeScript types, canonical JSON
helpers, and AJV validation for `workspace-manifest`, `change-set`,
`proposal-record`, `approval-record`, and `json-envelope`. The schema and
envelope versions are both `1.0.0`.

## JSON envelopes

CLI JSON output is one object with no extra properties:

```json
{"envelopeVersion":"1.0.0","ok":true,"command":"inspect","traceId":"uuid","data":{}}
```

On failure, `data` is absent and `error` is present:

```json
{"envelopeVersion":"1.0.0","ok":false,"command":"apply","traceId":"uuid","error":{"code":"ValidationFailed","message":"..."}}
```

The published envelope schema currently permits these error codes:
`InvalidInput`, `WorkspaceNotFound`, `ProposalNotFound`, `ProposalStale`,
`ApprovalRequired`, `CapabilityDenied`, `ValidationFailed`, `HostFailure`, and
`InternalError`. Other engine-only codes are not a promise of the CLI schema
unless listed here.

## ChangeSets and exact approval

A ChangeSet contains a workspace ID, base revision, timestamp, and operations.
`digestChangeSet` hashes its canonical JSON bytes using SHA-256 and emits
`sha256:<hex>`. A proposal stores that ChangeSet, its digest, and the revision
it was based on. An approval must repeat the proposal ID, workspace ID, base
revision, and exact digest.

At commit time the engine recomputes the digest, checks that the workspace has
not advanced, transforms the manifest, records approval/provenance in SQLite,
and writes the manifest. A later commit makes competing proposals stale.

Schema-valid does not mean engine-supported. The ChangeSet schema allows a
general operation `kind`, but this engine release executes only
`workspace.set-authority-mode` and `module.install`; other kinds are rejected
with `ValidationFailed`. The CLI creates only the former.

Use `validateProtocol(name, value)` before relying on a payload. Use
`canonicalJson`, `canonicalJsonBytes`, `sha256Digest`, and
`hasMatchingChangeSetDigest` for deterministic local verification.
