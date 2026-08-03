<p align="center">
  <img src="docs/assets/aimoto-banner.png" alt="AI-Mo-To — a friendly AI robot unicorn" width="760" />
</p>

<p align="center">
  <a href="https://github.com/dado-ph/AI-Mo-To/actions/workflows/ci.yml"><img src="https://github.com/dado-ph/AI-Mo-To/actions/workflows/ci.yml/badge.svg" alt="Continuous integration status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache-2.0 license" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js 22 or later" /></a>
  <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white" alt="pnpm 11" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.8" /></a>
</p>

<p align="center"><strong>A local AI workspace that adapts to what you need — while you stay in control.</strong></p>

# AI-Mo-To

AI-Mo-To creates local, human-controlled workspaces around what you need. Describe a goal in plain language—organize a project, run a process, or build a tool—and your workspace can be shaped for it. AI can help create and evolve that workspace, but **nothing changes until you approve it.**

## Two ways to use AI-Mo-To

### Use the CLI yourself

Use the `aimoto` CLI to create a workspace, choose its authority mode, inspect proposed changes, and approve them directly. It gives you a structured, transparent way to shape and run your local workspace.

### Work with your CLI coding agent

AI-Mo-To also works naturally alongside CLI coding agents such as Codex. Tell your agent what you want your workspace to do—set up a project hub, add a workflow, build a tool, or improve a view—and ask it to do it with AI-Mo-To. It uses `aimoto request "<need>" --workspace <path> --agent`, gives the agent an isolated app repository, then brings the proposed workspace change back to you for review.

> **Example:** “Create a workspace for my local project tracker, with tasks, due dates, and a weekly view, using AI-Mo-To.”

## How it works

1. **Describe the workspace you need.** Give the request directly to AI-Mo-To or to your CLI coding agent.
2. **Shape the workspace.** AI-Mo-To prepares and validates the proposed change in isolation, then shows the changes and required permissions.
3. **Review and apply.** You run the exact reviewed proposal, with a verifiable record and recovery point if you need to roll back.

## Why AI-Mo-To?

* **A workspace for your actual need.** Your workspace can be shaped around a project, process, tool, or other goal—not forced into a fixed app layout.
* **You remain in control.** AI can suggest and prepare workspace changes, but your approval is required before anything changes on your system.
* **The agent has clear boundaries.** Authority modes and declared capabilities limit what a coding agent can ask to do.
* **Every change is inspectable.** Proposals carry a digest, permissions, and provenance so you can see what was reviewed and applied.
* **Recovery is built in.** Structural changes receive an automatic snapshot, preserving earlier audit history when you restore.

## Get started

### Install on Windows

On Windows x64, install the latest release of **AI-Mo-To Desktop** and the `aimoto` CLI launcher with a single PowerShell command:

```powershell
irm https://raw.githubusercontent.com/dado-ph/AI-Mo-To/main/scripts/install.ps1 | iex
```

After installation, open a new PowerShell terminal and run `aimoto --help`.

### Create your first workspace

1. Create a workspace: `aimoto workspace create "My Workspace"`.
2. Change authority mode when needed: `aimoto plan --workspace <path> --set-authority build` creates a reviewable mode-change proposal.
3. Review the proposal, including its changes, required capabilities, and SHA-256 digest.
4. After reviewing it, apply the exact proposal with `aimoto apply --workspace <path> --proposal <id> --hash <digest>`.
5. Confirm the new, healthy workspace revision.

For a full step-by-step walkthrough, see the [Getting Started Guide](docs/getting-started.md).

---

## 🛠️ Building from Source

To build AI-Mo-To from source, you need **Node.js 22+** and **pnpm 11+**:

```powershell
# Clone the repository and install dependencies
git clone https://github.com/dado-ph/AI-Mo-To.git
cd AI-Mo-To
pnpm install

# Build all monorepo packages and CLI
pnpm build

# Run unit tests and deterministic verifiers
pnpm validate

# Build the installable Windows NSIS desktop application
pnpm --filter @ai-mo-to/desktop dist
```

The compiled desktop installer is written to `apps/desktop/release/`.

---

## 📁 Repository Structure

* **`apps/cli`**: The structured command-line interface for human operators and coding agents.
* **`apps/desktop`**: The installable Electron desktop application powered by `@ai-mo-to/ui-primitives`.
* **`packages/engine`**: Core workspace kernel enforcing `AuthorityStateGuard`, revisions, and proposal lifecycle.
* **`packages/protocol`**: JSON Schemas, canonical types, and approval/proposal audit contracts.
* **`packages/foundry`**: Reasoning, stack, UI/UX and safety guidance plus staging and content-addressing support for agent-built applications; it is not a finite catalogue of application types.
* **`packages/snapshot`**: Deterministic snapshot creation, verification, and recovery engine.
* **`packages/storage`**: Local SQLite database and JSON storage abstractions.
* **`packages/ui-primitives`**: Framework-free design tokens (`tokens.css`), WCAG 2.2 AA accessibility components, and authority badges.
* **`modules/`**: Built-in core modules (`aimoto.files`, `aimoto.tasks`).

---

## 📚 Documentation Links

* 📖 [Getting Started Guide](docs/getting-started.md) — Comprehensive user and developer walkthrough.
* 💻 [CLI Command Reference](docs/manual/cli.md) — Complete list of CLI commands, options, and error recovery actions.
* 🏗️ [Module Development Guide](docs/manual/module-development.md) — How to create custom modules for AI-Mo-To.
* ⚙️ [Technical Library APIs](docs/manual/library-apis.md) — Developer reference for extending core engine packages.
* 🛡️ [Operations & Boundaries](docs/manual/operations-and-limits.md) — Current capabilities and security limits.

---

## 📄 License

AI-Mo-To is licensed under the [Apache-2.0 License](LICENSE).
