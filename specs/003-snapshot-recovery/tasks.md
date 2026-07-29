# Tasks

- [x] Define snapshot manifest, object reference, verification, and restore-plan
  types.
- [x] Implement deterministic canonical JSON and SHA-256 addressing.
- [x] Implement atomic snapshot object and manifest creation.
- [x] Exclude credential and secret values while preserving binding keys.
- [x] Implement full manifest/object integrity verification.
- [x] Implement restore-as-new-revision planning with bundle availability
  checks.
- [x] Add disposable-workspace tests for determinism, integrity, secret
  exclusion, and non-destructive restore planning.
- [ ] Integrate the package with the engine/storage transaction and CLI in a
  later slice.
