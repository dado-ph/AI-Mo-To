# Agent-driven Habit Tracker proof

## Goal

Demonstrate the product promise locally: a person asks for a useful module,
reviews a plain-language plan tied to exact bytes, approves it, and receives an
installed module without an API key or hidden autonomous installation.

## Requirements

- `aimoto agent habit plan` accepts a plain-language request and emits a reviewable Habit Tracker plan.
- Generation is deterministic and local. The request is preserved in the proposal result; it does not alter the reviewed bundle.
- Foundry stages and validates the module before the engine receives a ChangeSet.
- The proposal binds the active workspace revision, staged bundle SHA-256 digest, requested capabilities, and local source directory.
- Existing `aimoto apply` is the only installation action. It requires the exact digest.
- On approval the engine copies the verified bundle and the workspace lists `local.habit-tracker`.

## Out of scope

External LLM calls, natural-language compilation beyond this deterministic
reference module, renderer data CRUD, and autonomous approval.

## Acceptance criteria

- A clean local workspace completes request, plan, stage, approval, and install.
- A wrong approval digest leaves the Habit Tracker uninstalled.
- The human command output explains what will be added and how to approve it.
