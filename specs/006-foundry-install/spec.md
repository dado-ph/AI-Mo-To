# Foundry Install Proposal Vertical Slice

## Goal

Translate a validated generated Foundry proposal into one portable, approval-ready
`module.install` ChangeSet without installing the module.

## Requirements

- Only an `install-generated` proposal can become a local-module ChangeSet.
- The caller supplies workspace identity, base revision, ChangeSet and operation
  identifiers, and creation time.
- The module pin uses the staged module's exact SHA-256 digest and directory as
  a local source reference.
- Requested capabilities are explicit, reviewable operation effects.
- The ChangeSet preconditions bind the workspace revision and staged digest.
- Existing-module proposals are rejected explicitly until their source-selection
  and trust policy are defined.
- A verifier recomputes the staged directory bytes and rejects symbolic links;
  disposable dry-activation state is excluded.

## Out of scope

Proposal persistence, approval, workspace mutation, and copying a staged bundle
into a workspace are owned by the engine.

## Acceptance criteria

- A staged Habit Tracker produces one structurally valid `module.install`
  ChangeSet with its exact local digest and requested capability effect.
- Byte changes after staging make verification fail.
- An existing-module proposal cannot be accidentally treated as a generated
  local install.
