# Implementation Plan

## Boundary

`@ai-mo-to/protocol` owns portable ChangeSet, proposal, and approval contracts,
schemas, canonical serialization, and digest verification helpers. The engine
owns persistence and transaction semantics.

## Design

1. Serialize JSON-compatible protocol values recursively with sorted object
   keys and no whitespace.
2. SHA-256 the UTF-8 canonical bytes and prefix the lowercase hex digest with
   `sha256:`.
3. Store this digest redundantly on ProposalRecord and ApprovalRecord, so an
   approval can be checked without trusting a mutable object reference.
4. Keep structural JSON Schema validation separate from semantic equality;
   engine transactions use `hasMatchingChangeSetDigest` and revision checks.
