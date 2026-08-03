# Getting Started with AI-Mo-To

Welcome to **AI-Mo-To**! AI-Mo-To is a human-governed local workspace harness and mega-wrapper designed for AI pair-programming and tool creation.

---

## 🏛️ The 3-Tier Architecture

AI-Mo-To is structured around three clear boundaries that guarantee safety, privacy, and full human control:

```
  ┌─────────────────────────────────────────────────────────────┐
  │  Tier 1: Core Host Platform (Immutable Repo / Binaries)    │
  │  • Platform engine, safety sandbox, CLI & Desktop Shell     │
  │  • AI Agents are STRICTLY FORBIDDEN from editing Tier 1.   │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────┐
  │  Tier 2: Generative App Lab (Foundry Staging Lab)           │
  │  • Isolated build directory per outcome request             │
  │  • AI writes React UI, CSS tokens, Python/Node scripts      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ (Human Approval & Digest Verification)
  ┌──────────────────────────────▼──────────────────────────────┐
  │  Tier 3: User Workspace (Documents/AI-Mo-To/Workspaces)     │
  │  • Your actual files (.md, .pdf, .csv, .py, code)            │
  │  • Human-governed, file-native, offline environment         │
  └─────────────────────────────────────────────────────────────┘
```

1. **Tier 1 (Core Host Platform)**: The underlying engine, security sandbox, and desktop shell. It stays clean and immutable—AI agents never modify Tier 1 files.
2. **Tier 2 (Generative App Lab / Foundry)**: Where the AI experiments, writes source code (React UI components, CSS design tokens, Python/Node scripts), and compiles self-contained app bundles.
3. **Tier 3 (User Workspaces)**: Located natively in your natural system folders (e.g. `Documents/AI-Mo-To/Workspaces/`). Contains your actual files (`.md`, `.pdf`, `.csv`, code) and installed, verified app modules.

---

## 📌 Prerequisites

To run AI-Mo-To, you need:
* **Windows 10/11 x64** (for installer release)
* Or **Node.js 22+** & **pnpm 11+** (if building from source)

---

## 🛠️ Step 1: Create Your First File-Native Workspace

Create a workspace in your natural documents directory:

```powershell
$workspace = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "AI-Mo-To\Workspaces\My-Workspace"
pnpm --filter @ai-mo-to/cli aimoto workspace create "My Workspace" --root $workspace
```

Upon creation, AI-Mo-To generates a workspace at **Revision 0** with two core built-in modules:
* **Files (`aimoto.files`)**: Local file indexing and knowledge management.
* **Tasks (`aimoto.tasks`)**: Action item tracking and workspace task management.

Inspect your workspace state at any time:

```powershell
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace $workspace
```

---

## 🛡️ Step 2: Understanding Authority Modes

AI-Mo-To operates under **5 Monotonic Authority Modes** to ensure safety:

| Authority Mode | Capabilities & Restrictions |
| :--- | :--- |
| **`observe`** | **Read-Only**: Workspace context can be inspected, but all write/mutation operations are blocked. |
| **`suggest`** | **Planning Mode** *(Default)*: AI agents can generate plans and proposals (`ChangeSet`), but cannot apply them. |
| **`assist`** | **Staging Mode**: Proposals can be prepared and human approvals recorded. |
| **`execute`** | **Execution Mode**: Pre-approved proposals and schema-validated commands execute automatically. |
| **`build`** | **Foundry Mode**: Full authority to stage and install new custom modules or modify core schemas. |

---

## 💡 Step 3: Request a Custom Tool (Generative Staging)

Ask AI-Mo-To to generate a tool for an outcome you want:

```powershell
# 1. Ask the AI for an outcome request proposal
$plan = pnpm --filter @ai-mo-to/cli aimoto request "I want to track meditation every day" --workspace $workspace --json | ConvertFrom-Json

# 2. Inspect the generated proposal
$plan.data.plan
```

Review the output. Notice two key fields:
* **`proposalId`**: The unique identifier for this specific installation request.
* **`changeSetDigest`**: The SHA-256 fingerprint of the exact diff you reviewed.

---

## ✅ Step 4: Approve and Apply the Proposal

Before any state changes on disk, AI-Mo-To requires human approval binding the exact `proposalId` and `changeSetDigest`:

```powershell
# Apply the reviewed proposal using its proposalId and SHA-256 digest
pnpm --filter @ai-mo-to/cli aimoto apply --workspace $workspace --proposal $plan.data.proposal.proposalId --hash $plan.data.proposal.changeSetDigest --json

# Verify the workspace update
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace $workspace
```

Your workspace will now reflect **Revision 1** and include your new installed dynamic module alongside **Files** and **Tasks**.

---

## 📸 Step 5: Create and Recover a Safety Snapshot

Before making major structural updates, create a snapshot point:

```powershell
# Create a snapshot point
$snapshot = pnpm --filter @ai-mo-to/cli aimoto snapshot create --workspace $workspace --json | ConvertFrom-Json

# Inspect the created snapshot
pnpm --filter @ai-mo-to/cli aimoto snapshot inspect $snapshot.data.snapshotId --workspace $workspace --json
```

### Restoring State Safely
Restoring a snapshot in AI-Mo-To follows a governed 2-step process:
1. **`snapshot restore-propose`**: Generates a restoration proposal without touching workspace state.
2. **`aimoto apply`**: Applies the proposal with human approval, restoring state as a **new revision** while preserving complete historical audit logs.

---

## ❓ Frequently Asked Questions & Troubleshooting

### Q: Can an AI model modify the core AI-Mo-To application?
**A**: No. Tier 1 (the core AI-Mo-To application repository and binaries) is strictly immutable to AI agents. The AI agent only writes code inside Tier 2 (the isolated Foundry staging directory), which is then verified and approved into Tier 3 (your workspace).

### Q: Does AI-Mo-To lock my data inside a hidden database?
**A**: No. AI-Mo-To is file-native. Your documents, notes, CSVs, and code live as normal files in your workspace directory (`Documents/AI-Mo-To/Workspaces/`). You can open, edit, and move them with any text editor or tools you love.

---

## 🔗 Next Steps

* Read the [CLI Command Reference](manual/cli.md) for full argument lists.
* Explore [Module Development](manual/module-development.md) to build your own custom tools.
