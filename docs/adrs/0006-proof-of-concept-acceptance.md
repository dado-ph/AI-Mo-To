# ADR-0006: Proof-of-Concept Acceptance Standard

- Status: Accepted (Updated 2026-08-03)
- Date: 2026-07-29

## Decision

The proof-of-concept standard for AI-Mo-To is an open workspace harness into which an AI agent generates, stages, and installs a custom dynamic mini-app matching a user's ordinary outcome request without manual code edits.

The proof must enforce the **3-Tier Boundary Contract**:
1. **Tier 1 (Core Host Platform)**: The AI agent is strictly forbidden from editing the core AI-Mo-To product repository (`packages/`, `apps/`).
2. **Tier 2 (Generative App Lab / Staging)**: The AI agent writes UI components, CSS design tokens, Python/Node scripts, and manifests inside an isolated staging directory.
3. **Tier 3 (User Workspace)**: The human-governed workspace (`Documents/AI-Mo-To/Workspaces/`). User files (`.md`, `.pdf`, `.csv`, code) are primary, and installed app bundles run under explicit capability governance.

The proof loop covers staging, static validation, dry activation, exact-digest approval, transactional commit, stale-proposal rejection, host fault isolation, snapshot restoration, and versioned JSON CLI output.

## Consequences

Multi-engine routing, a public registry, cross-device sync, WASI hosting, and core self-updates remain outside v0.1 until this loop passes.
