# Workspace Implementation Handoff Design

## Goal

Make AI-Mo-To help an agent continue from planning into real workspace implementation. A workspace is a user-owned application and its supporting files, not a collection of classified modules.

## User workflow

1. A person describes a workspace change.
2. The coding agent plans the change.
3. The agent runs `aimoto request` with the plan or request.
4. `aimoto request` resolves the canonical workspace root, creates the root when it does not exist, reads the current workspace version and notes, and returns an implementation brief.
5. The agent reads that brief and implements the requested workspace directly below the returned workspace root.
6. The agent verifies the interactive UI, callbacks, scripts, and other requested behavior.
7. The agent explains the completed changes and asks the person whether to save them as a new workspace version.
8. Only after an explicit later confirmation does the agent create the next workspace version.

`aimoto request` is a context handoff. It is not a classifier, builder, module installer, or approval command.

## Workspace shape

A new workspace contains only the minimum AI-Mo-To metadata needed to identify it, retain notes, and manage versions. It does not install Files, Tasks, or any other default module. It does not define a default home view.

The coding agent owns the requested application surface. It creates the UI, function callbacks, scripts, assets, and only the workspace-relative directories needed by that application. The workspace root is `%LOCALAPPDATA%/AI-Mo-To/workspaces/<workspace-name>/` unless the user explicitly supplies a root.

## Request response

`aimoto request` returns a machine-readable and human-readable implementation brief containing:

- canonical workspace root;
- whether the root was created or reused;
- current version identity and number;
- relevant stored workspace notes;
- the submitted request or plan;
- curated implementation rules.

The curated rules require the agent to continue implementation in the returned root, build a real interactive UI, connect controls to actual callbacks or scripts, use Shadcn, include suitable first-use, empty, loading, and error states, create only necessary files, verify behavior before reporting completion, and avoid returning a mockup, a documentation-only response, or an unimplemented plan.

The response ends with an unambiguous instruction that `request` did not build the workspace and the agent must now implement it in the returned root.

The request response may select extra rules from workspace notes and workspace maturity state. The selection mechanism is explicit data, not keyword classification of the person's request.

## Version control

AI-Mo-To versions the workspace filesystem as the primary artifact. A version captures the workspace's application files and AI-Mo-To metadata required to restore it. It does not depend on module manifests or module bundles.

Creating a version is always explicit. The coding agent must show the user the completed change summary and ask for approval. The user must approve in a later message before the agent invokes the version-create command. Restoring a prior version creates a new current version and preserves history.

## Removed legacy model

The implementation removes:

- request-category classification (`habit`, `task`, `research`, and `custom`);
- default Files and Tasks installation;
- module pins, module manifests, module-install changesets, and module-view routing as the workspace model;
- the generated-app staging repository as the delivered workspace;
- desktop views that present a workspace as installed modules.

The desktop app instead presents the workspace name, current version, version history, notes, and the workspace's agent-built application surface.

## Errors and safety

- If the canonical root cannot be resolved, created, or accessed, `request` returns an error before producing an implementation brief.
- The agent must not fall back to its terminal directory, home directory, a repository checkout, or a staging directory.
- A version request with no workspace changes reports that there is nothing to save.
- A failed version capture leaves the current workspace and previous versions unchanged.

## Verification

Tests must prove that a new workspace has no default modules, `request` returns an implementation brief after creating or reusing the canonical root, request category does not affect the response, a version captures and restores workspace files, and no version is created until an explicit version-create command runs.
