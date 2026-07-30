# Outcome-First Agent Acceptance Specification

## Purpose

Validate AI-Mo-To's central product claim: a person can begin with an ordinary
need rather than a software design, and an unfamiliar coding agent can turn that
need into a useful, inspectable, human-approved, and recoverable local workspace.

The proof must exercise the installed product. Repository knowledge, source
imports, direct database edits, and hidden implementation instructions are not
valid substitutes.

## Actors

- **Person:** knows only how to run one PowerShell installation command and
  describe an outcome in ordinary language.
- **External agent:** starts without repository context and discovers AI-Mo-To
  through the installed CLI's help, readable output, and versioned JSON output.
- **AI-Mo-To:** owns workspace state, capability decisions, proposals, approval,
  installation, inspection, and recovery.

## Acceptance journey

1. On a clean Windows user profile, the person runs one documented PowerShell
   command.
2. The command installs the desktop application and the `aimoto` CLI, or exits
   with a clear, actionable failure without partially claiming success.
3. In a new agent session outside the repository, the person says only:
   "I need a simple place to track a daily habit. Set it up for me."
4. The agent discovers the CLI using normal shell discovery and `aimoto --help`.
   If its inherited PATH predates installation and omits WindowsApps, the
   installed integration resolves the stable per-user launcher and still
   invokes `aimoto --help`; an existing launcher may not be treated as proof
   that AI-Mo-To is not installed.
5. The agent initializes a usable workspace and inspects its current state.
6. The agent asks AI-Mo-To to plan the requested support. It may not write a
   module directly into the active workspace or edit AI-Mo-To's source.
7. Before any structural mutation, the person receives a plain-language
   explanation of what will change, the requested capabilities, and the
   recovery path.
8. The person can approve or reject the exact proposal. Approval is bound to the
   reviewed digest; rejection or a wrong/stale digest leaves active state
   unchanged.
9. After approval, the desktop application opens a coherent workspace where the
   new capability is visibly usable alongside the default Files and Tasks
   capabilities.
10. The person or agent can inspect who proposed and approved the change, which
    module/version/digest was installed, and which revision received it.
11. A verified recovery point can be created and restored through another
    visible, digest-bound approval as a new revision without erasing history.

## Philosophical assertions

- **Outcome before ontology:** the person is never required to name a schema,
  module, command, package, path, or renderer primitive.
- **Conversation becomes structure:** the result is a durable workspace with
  records, views, and actions, not merely generated files or chat instructions.
- **Trust through visibility:** consequential changes remain proposals until
  the person sees their effects and explicitly approves the exact version.
- **Earned complexity:** the initial workspace is useful without model setup;
  the requested Habit Tracker is added because the expressed need justifies it.
- **Ownership and inspectability:** composition, permissions, provenance,
  revision, and recovery are visible and locally controlled.
- **Replaceable intelligence:** the external agent uses stable CLI contracts;
  success must not depend on private knowledge of one model's tool format.

## Invalid proof shortcuts

- Running through `pnpm`, importing workspace packages, or using a source checkout.
- Giving the external agent repository files, internal plans, exact command
  sequences, proposal identifiers, or schema/module implementation details.
- Pre-creating the target workspace or Habit Tracker for the evaluated profile.
- Automatically approving a proposal on the person's behalf.
- Treating static manifest installation as success when the capability cannot be
  used through the installed product.
- Claiming recovery when only a configuration pointer changes and required
  workspace data or module material cannot be reconstructed.

## Required evidence

- Installer command, exit status, and artifact identity.
- A successful `aimoto --help` invocation resolved through the stable installed
  launcher while WindowsApps is deliberately absent from the agent process PATH.
- Complete external-agent transcript beginning with the ordinary-language need.
- Raw external-agent stdout/stderr plus a runtime preflight classification. A
  `codex-windows-sandbox-setup.exe` access-denied failure before `aimoto` is
  reached is agent infrastructure failure, not evidence against AI-Mo-To.
- CLI commands and versioned JSON envelopes used by the agent.
- Human-visible proposal and explicit approval or rejection.
- Before/after workspace inspections and revision history.
- A desktop-use recording or automated packaged-app test.
- Wrong-digest and stale-proposal negative results.
- Snapshot creation, approved restoration, and post-restoration integrity result.
- A clean final `pnpm validate` and packaged-product acceptance run.

## Completion rule

Implementation work is incomplete until repository validation passes and the
clean installed-product journey passes without technical coaching. Any failure
starts another targeted implementation wave followed by full validation.
Agent infrastructure failures must remain visible and do not count as product
success. One `-s danger-full-access` retry is allowed only for the known sandbox
setup access-denied signature, only before AI-Mo-To is reached, and only in a
verified disposable acceptance root outside the repository.
