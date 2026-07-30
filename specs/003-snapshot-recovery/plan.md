# Implementation Plan

## Design

The snapshot package serializes each logical component to canonical JSON (or
uses supplied module bundle bytes), hashes it with SHA-256, and stores it once
under `objects/<digest>`. A canonical manifest points to those objects and is
itself hashed; snapshots are stored under `snapshots/<manifest-digest>`.

The public API has three operations:

- `createSnapshot` validates secret exclusion, writes objects atomically, and
  writes the immutable snapshot manifest.
- `verifySnapshot` re-hashes the manifest and all referenced objects.
- `planRestore` verifies first, checks required bundles, and returns an
  immutable proposal payload for `activeRevision + 1`.

## Boundaries

This slice owns only `packages/snapshot` and its Spec Kit. It consumes Node
filesystem and cryptography primitives and intentionally has no dependency on
the engine, storage, protocol, or CLI packages.

## Verification

Unit tests create temporary roots, exercise deterministic creation and complete
verification, tamper with an object, reject secret-bearing input, and confirm
restore planning is non-destructive.
