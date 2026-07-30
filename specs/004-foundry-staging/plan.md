# Implementation Plan

## Boundary

Implement an independent `@ai-mo-to/foundry` package. It owns planning and
temporary staging orchestration only, and imports no engine, storage, CLI, or
workspace mutation code.

## Design

1. Model request-to-module plans and generated bundle files as plain typed
   values.
2. Inject selection, generation, static validation, and dry-activation hooks so
   providers and runtimes can be added without changing the staging contract.
3. Compute SHA-256 from sorted normalized paths plus byte lengths and bytes.
4. Materialize bundles below a caller-provided staging root using the digest as
   the directory name.
5. Create disposable dry-run state below the staging directory and return a
   proposal only after all checks pass.
6. Prove isolation with tests that fingerprint an active workspace before and
   after staging.

## Digest framing

For every file sorted by normalized POSIX relative path, hash the UTF-8 path,
a NUL byte, the ASCII byte length, a NUL byte, the exact file bytes, and a final
NUL byte. The public digest is `sha256:<lowercase hex>`.

## Integration seam

The engine may later translate a successful proposal into an immutable
ChangeSet. The protocol package may later adopt these planning types or define
equivalent schemas; this slice deliberately has no dependency on either.

