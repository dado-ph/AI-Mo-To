# Getting Started with AI-Mo-To

Welcome to **AI-Mo-To**! This guide walks you through setting up your first local workspace, understanding authority modes, staging an AI-generated Habit Tracker module, approving changes, and taking safety snapshots.

---

## 📌 Prerequisites

To run AI-Mo-To, you need:
* **Windows 10/11 x64** (for installer release)
* Or **Node.js 22+** & **pnpm 11+** (if building from source)

---

## 📦 Step 1: Open the Application or CLI

### Installed Application
If you installed AI-Mo-To using the installer, launch **AI-Mo-To** from your Windows Start Menu. The desktop app will open and prompt you to select a workspace directory.

### Source / Developer Checkout
If you are developing locally, open PowerShell in the repository root and build the project once:

```powershell
pnpm install
pnpm build
```

---

## 🛠️ Step 2: Create Your First Workspace

Create a dedicated folder for your workspace:

```powershell
$workspace = Join-Path (Get-Location) "my-first-workspace"
pnpm --filter @ai-mo-to/cli aimoto workspace create "My Workspace" --root $workspace
```

Upon creation, AI-Mo-To generates a workspace at **Revision 0** with two built-in core modules:
* **Files (`aimoto.files`)**: Local file indexing and knowledge management.
* **Tasks (`aimoto.tasks`)**: Action item tracking and task management.

Inspect your workspace state at any time:

```powershell
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace $workspace
```

---

## 🛡️ Step 3: Understanding Authority Modes

AI-Mo-To operates under **5 Monotonic Authority Modes** to ensure safety:

| Authority Mode | Capabilities & Restrictions |
| :--- | :--- |
| **`observe`** | **Read-Only**: Workspace context can be inspected, but all write/mutation operations are blocked. |
| **`suggest`** | **Planning Mode** *(Default)*: AI agents can generate plans and proposals (`ChangeSet`), but cannot apply them. |
| **`assist`** | **Staging Mode**: Proposals can be prepared and human approvals recorded. |
| **`execute`** | **Execution Mode**: Pre-approved proposals and schema-validated commands execute automatically. |
| **`build`** | **Foundry Mode**: Full authority to stage and install new custom modules or modify core schemas. |

---

## 💡 Step 4: Ask for a Habit Tracker (Agent Staging Proof)

AI-Mo-To includes a deterministic, inspectable local agent proof that generates a Habit Tracker tool without requiring network requests or external API keys:

```powershell
# 1. Ask the agent for a Habit Tracker plan
$plan = pnpm --filter @ai-mo-to/cli aimoto agent habit plan --workspace $workspace --request "Track daily meditation" --json | ConvertFrom-Json

# 2. Inspect the generated proposal
$plan.data.plan
```

Review the output. Notice two key fields:
* **`proposalId`**: The unique identifier for this specific installation request.
* **`changeSetDigest`**: The SHA-256 fingerprint of the exact diff you reviewed.

---

## ✅ Step 5: Approve and Apply the Proposal

Before any state changes on disk, AI-Mo-To requires human approval binding the exact `proposalId` and `changeSetDigest`:

```powershell
# Apply the reviewed proposal using its proposalId and SHA-256 digest
pnpm --filter @ai-mo-to/cli aimoto apply --workspace $workspace --proposal $plan.data.proposal.proposalId --hash $plan.data.proposal.changeSetDigest --json

# Verify the workspace update
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace $workspace
```

Your workspace will now reflect **Revision 1** and include three installed modules: **Files**, **Tasks**, and **Habit Tracker**.

---

## 📸 Step 6: Create and Recover a Safety Snapshot

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

### Q: What happens if a proposal application fails midway?
**A**: AI-Mo-To automatically creates an internal pre-apply snapshot before any disk write. If an error occurs during proposal execution, state is automatically rolled back to the pre-apply snapshot.

### Q: Can an AI model execute arbitrary code on my PC?
**A**: No. Modules execute in isolated host processes under strict capability declarations (`module.json`), and state-mutating commands require explicit human approval.

---

## 🔗 Next Steps

* Read the [CLI Command Reference](manual/cli.md) for full argument lists.
* Explore [Module Development](manual/module-development.md) to build your own custom tools.
