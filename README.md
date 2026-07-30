# AI-Mo-To 🚀

> **Your Local-First, Human-Governed AI Workspace Foundry**

AI-Mo-To is a local-first desktop application and CLI tool designed to turn modest requirements into modular, inspectable, recoverable software workspaces. Rather than letting AI models execute opaque, un-audited code directly on your system, AI-Mo-To enforces **human approval**, **bounded capabilities**, and **5 distinct authority states** before any workspace state is changed.

---

## 🌟 Key Features

* **🛡️ Human-in-the-Loop Governance**: AI models suggest changes via content-addressed proposals (`ChangeSet`), but mutations only execute after explicit human approval.
* **🔒 5 Monotonic Authority States**: Workspaces operate under `Observe`, `Suggest`, `Assist`, `Execute`, or `Build` modes to strictly limit what operations AI models can request or execute.
* **📦 Bounded Module Isolation**: Modules operate within strict, schema-validated capabilities and cannot escape declared boundaries or route unauthorized syscalls.
* **📸 Snapshot Recovery**: Every structural change is backed by an automatic, atomic SHA-256 pre-apply snapshot. Restoring a workspace creates a clean, verifiable new revision without destroying past audit history.
* **📜 Complete Provenance Chain**: Every modification tracks base revision, target revision, `changeSetDigest`, `approvalId`, `approvedBy`, and AI model telemetry (`modelId`, `promptDigest`).

---

## 🚀 Quick Start

### 1. One-Line Windows Installation

On Windows x64, install the latest release of **AI-Mo-To Desktop** and the `aimoto` CLI launcher with a single PowerShell command:

```powershell
irm https://raw.githubusercontent.com/dado-ph/AI-Mo-To/main/scripts/install.ps1 | iex
```

After installation, open a new PowerShell terminal and run `aimoto --help`.

### 2. Standard 5-Step Product Workflow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ 1. Create       │───>│ 2. Set Mode     │───>│ 3. Review Plan  │───>│ 4. Approve      │───>│ 5. Verified     │
│    Workspace    │    │    (Build/Assist)│    │    & Diff Hash  │    │    Proposal     │    │    Revision     │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

1. **Create a Workspace**: `aimoto workspace create "My Workspace"`
2. **Set Authority Mode**: Switch to `Build` mode for staging tools or `Suggest` mode for planning.
3. **Review Proposal**: Inspect the proposed changes, required capabilities, and SHA-256 digest.
4. **Approve & Apply**: Run `aimoto proposal approve` and `aimoto apply` to execute the approved diff.
5. **Confirm Revision**: Verify that your workspace has bumped to a clean, healthy new revision.

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
* **`packages/foundry`**: Staging engine for local module generation, habit tracking proofs, and content-addressed bundles.
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
