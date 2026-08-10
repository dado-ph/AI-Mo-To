# Canonical AppData Workspace Root

## Purpose

Prevent the generated AI agent from treating its terminal start directory, the user's home directory, or its generated-app staging repository as the user workspace.

## Approved contract

AI-Mo-To has one canonical workspace location for each workspace:

`%LOCALAPPDATA%/AI-Mo-To/workspaces/<workspace-name>/`

The workspace name is resolved by AI-Mo-To. The agent must not choose an alternate root for normal workspace creation.

Before producing a plan digest, the workspace workflow must perform a boolean existence check for that canonical root.

- When the root does not exist, create it.
- When the root exists, use it.
- Run workspace-related commands from that root.
- Create optional directories and files only below that root, and only when the requested workspace needs them.

The generated-app staging repository remains the restricted location for generated module source. It is not a substitute for the user workspace and must not receive user-facing workspace files.

## Instruction precedence

The AI-Mo-To workspace-creation guidance must be concise and authoritative for workspace resolution. It must not require the external agent to follow heavyweight, conflicting planning or skill workflows before the existence check and plan-digest boundary.

The enforcement is behavioral guidance at the agent-workflow boundary, not a new deterministic filesystem policy. The product will not pre-create fixed folders such as `docs/`; the agent creates subfolders only as the requested workspace requires.

## Data flow

1. Resolve the canonical AppData workspace root from the workspace name.
2. Evaluate `exists(workspaceRoot)`.
3. Create `workspaceRoot` only if the result is false.
4. Set the workspace workflow's current directory and explicit context to `workspaceRoot`.
5. Let the agent create necessary workspace-relative content and the isolated generated app.
6. Generate the plan digest only after the existence check and root context have completed.

## Error handling

- If the canonical location cannot be resolved, stop before planning and report the resolution error.
- If the root cannot be created or accessed, stop before producing a digest and report the filesystem error.
- Never silently fall back to the home directory, terminal directory, or staging repository.

## Tests

- A workflow with a nonexistent canonical root creates it before the agent is invoked and before a digest is returned.
- A workflow with an existing canonical root reuses it.
- The agent-facing context identifies the canonical root and prohibits fallbacks.
- Existing generated-app source remains isolated from user workspace content.
