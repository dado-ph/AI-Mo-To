# Library APIs

These are local TypeScript packages, not a network HTTP API. Every
`@ai-mo-to/*` package here is private and monorepo-local; this manual does not
claim npm publication. Build first with `pnpm build`, then run examples from a
workspace package, test, or local TypeScript entrypoint that resolves the
workspace dependencies.

## Verify private workspace packages

Run these commands from the repository root after `pnpm install` and `pnpm
build`. They verify that each private package is resolvable from its own pnpm
workspace context:

```sh
pnpm --filter @ai-mo-to/protocol exec node --input-type=module -e "import('@ai-mo-to/protocol').then(() => console.log('protocol ok'))"
pnpm --filter @ai-mo-to/engine exec node --input-type=module -e "import('@ai-mo-to/engine').then(() => console.log('engine ok'))"
pnpm --filter @ai-mo-to/foundry exec node --input-type=module -e "import('@ai-mo-to/foundry').then(() => console.log('foundry ok'))"
pnpm --filter @ai-mo-to/snapshot exec node --input-type=module -e "import('@ai-mo-to/snapshot').then(() => console.log('snapshot ok'))"
pnpm --filter @ai-mo-to/module-sdk exec node --input-type=module -e "import('@ai-mo-to/module-sdk').then(() => console.log('module-sdk ok'))"
pnpm --filter @ai-mo-to/module-host exec node --input-type=module -e "import('@ai-mo-to/module-host').then(() => console.log('module-host ok'))"
```

Do not substitute `node --input-type=module -e "import('@ai-mo-to/engine')"`
at the repository root. The root package does not declare these private
packages as dependencies, so Node's normal package resolution cannot find them
there. `pnpm --filter ... exec` runs from the selected workspace package, whose
workspace dependency links provide the required resolution context.

## Engine and protocol

`WorkspaceEngine` owns durable workspace state. Its important inputs are
`CreateWorkspaceInput { root, name, workspaceId?, now? }`,
`CreateProposalInput { root, changeSet, proposalId, now? }`, and
`ApproveProposalInput { root, approval }`. Creation, inspection, and approval
return `WorkspaceInspection { root, workspaceId, name, revision, createdAt,
modules, authorityMode, health: "ok" }`; proposal creation returns a
`ProposalRecord { proposalId, workspaceId, baseRevision, changeSet,
changeSetDigest, status, createdAt }`.

```ts
import { randomUUID } from "node:crypto";
import { WorkspaceEngine } from "@ai-mo-to/engine";
import { SCHEMA_VERSION, digestChangeSet, validateProtocol, type ChangeSet } from "@ai-mo-to/protocol";

const root = "./example-workspace";
const engine = new WorkspaceEngine();
const workspace = await engine.createWorkspace({ root, name: "Example Workspace" });
const changeSet: ChangeSet = {
  schemaVersion: SCHEMA_VERSION, changeSetId: randomUUID(), workspaceId: workspace.workspaceId,
  baseRevision: workspace.revision, createdAt: new Date().toISOString(),
  operations: [{ operationId: "set-mode", kind: "workspace.set-authority-mode",
    input: { authorityMode: "build" },
    preconditions: [{ kind: "workspace.revision", value: workspace.revision }],
    effects: ["workspace.settings.write"], reversibility: "reversible" }]
};
if (!validateProtocol("change-set", changeSet).valid) throw new Error("invalid ChangeSet");
const digest = digestChangeSet(changeSet); // sha256:<hex>
const proposal = await engine.createProposal({ root, changeSet, proposalId: randomUUID() });
const applied = await engine.approveProposal({ root, approval: {
  schemaVersion: SCHEMA_VERSION, approvalId: randomUUID(), proposalId: proposal.proposalId,
  workspaceId: proposal.workspaceId, baseRevision: proposal.baseRevision,
  changeSetDigest: digest, approvedAt: new Date().toISOString(), approvedBy: "local-user"
}});
console.log(applied.revision); // 1
```

Use `validateProtocol("workspace-manifest" | "change-set" | "proposal-record" |
"approval-record" | "json-envelope", value)` before submitting external data.
`canonicalJson`, `canonicalJsonBytes`, `sha256Digest`, and `digestChangeSet`
provide deterministic byte-level hashing. The engine executes only
`workspace.set-authority-mode` and `module.install`, even if another operation
kind passes generic schema validation.

`@ai-mo-to/storage` exposes lower-level `WorkspaceStore` and layout/path helpers.
It is for local SQLite access; callers creating a store must call `close()`.

## Foundry and the built-in Habit Tracker

`Foundry` needs caller-supplied hooks and has no generic model provider or
registry. The CLI includes one deliberate reference flow: `aimoto agent habit
plan` uses a deterministic local generator to prepare a Habit Tracker proposal,
which must still be approved through the engine. `FoundryRequest` is
`{ requestId, workspaceId, text }`; a
`ModulePlan` adds module ID/display name, outcomes, records, views, commands,
events, and requested capabilities. A successful generated result contains an
`install-generated` proposal with `{ moduleId, version, digest, directory }`.

```ts
import { Foundry, proposalToModuleInstallChangeSet } from "@ai-mo-to/foundry";

const foundry = new Foundry("./staging", {
  selector: { async select() { return undefined; } },
  generator: { async generate(plan) { return {
    moduleId: plan.moduleId, version: "0.1.0", requestedCapabilities: [],
    files: [{ path: "module.json", content: JSON.stringify({ id: plan.moduleId }) }]
  }; } },
  staticValidator: { async validate() { return { ok: true, diagnostics: [] }; } },
  dryActivator: { async activate() { return { ok: true, diagnostics: [] }; } }
});
const request = { requestId: "request-1", workspaceId: "workspace-1", text: "Add notes" };
const plan = { requestId: request.requestId, moduleId: "notes", displayName: "Notes",
  userOutcomes: ["write notes"], records: [], views: [], commands: [], events: [], requestedCapabilities: [] };
const result = await foundry.stage(request, plan);
if (result.ok && result.proposal.kind === "install-generated") {
  const changeSet = proposalToModuleInstallChangeSet(result.proposal, {
    workspaceId: request.workspaceId, baseRevision: 0, changeSetId: "change-1",
    operationId: "install-notes", createdAt: new Date().toISOString()
  });
  console.log(changeSet.operations[0]?.kind); // module.install
}
```

The engine re-verifies the staged digest when approving a generated
`module.install` ChangeSet. `use-existing` proposals cannot be converted by
this release. Keep the staged module directory present and byte-identical from
`Foundry.stage()` through engine approval: the install ChangeSet records that
directory as its local source, and approval recomputes its digest from disk.

## Snapshots

`SnapshotInput` requires workspace identity/revision, a serializable workspace
manifest, module bundle bytes plus schemas, serializable `data` and `context`,
event-log position, and engine configuration references. It forbids credentials
and secrets; optional credential binding keys are names only.

```ts
import { createSnapshot, verifySnapshot, planRestore } from "@ai-mo-to/snapshot";

const input = { workspaceId: "workspace-1", workspaceRevision: 1,
  workspaceManifest: { name: "Example" }, modules: [], data: { notes: [] }, context: {},
  eventLogPosition: 0, engineConfigurationRefs: [], credentialBindingKeys: ["service-token"] };
const created = await createSnapshot("./snapshot-store", input);
const verified = await verifySnapshot("./snapshot-store", created.snapshotId);
if (!verified.valid) throw new Error(verified.errors.join("; "));
const restore = await planRestore("./snapshot-store", created.snapshotId, 1);
console.log(restore.kind, restore.targetRevision); // restore-as-new-revision, 2
```

`CreatedSnapshot` includes `snapshotId`, path, and manifest. `verifySnapshot`
returns `{ valid, errors, manifest? }`; `planRestore` returns a plan but never
applies it. For an approved restore, call
`WorkspaceEngine.createSnapshotRestoreProposal`, review the returned proposal,
then approve its exact ChangeSet digest. The CLI equivalent is
`aimoto snapshot restore-propose <snapshot-id>` followed by `aimoto apply`.

## Module host and SDK

`ModuleHost` starts a Node child process, sends `module.initialize`, and invokes
commands through framed JSON-RPC. The entrypoint must itself implement the
framed protocol; defining a `ModuleHandler` type alone does not create a
dispatcher. `WorkspaceEngine.mintContext()` and `invokeModule()` provide the
engine-owned broker boundary for a host call, including workspace/module/revision
binding, expiry, operation budget, authority ceiling, and required capability
checks. The host remains a local-process supervisor rather than a security
sandbox.

Save this complete minimal child-process handler as `module-entrypoint.mjs`.
It uses only Node built-ins, reads `Content-Length` frames from stdin, and sends
valid JSON-RPC responses to stdout:

```js
let buffer = Buffer.alloc(0);
const headerEnd = Buffer.from("\r\n\r\n");

function send(value) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function respond(request) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.id !== "string") return;
  if (request.method === "module.initialize") {
    send({ jsonrpc: "2.0", id: request.id, result: { ready: true } });
  } else if (request.method === "module.invoke") {
    const { command, input } = request.params ?? {};
    send({ jsonrpc: "2.0", id: request.id, result: { command, input } });
  } else if (request.method === "module.shutdown") {
    send({ jsonrpc: "2.0", id: request.id, result: null });
  } else {
    send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const boundary = buffer.indexOf(headerEnd);
    if (boundary < 0) return;
    const header = buffer.subarray(0, boundary).toString("ascii");
    const match = /^Content-Length: ([0-9]+)$/i.exec(header);
    if (!match) throw new Error("Invalid frame header");
    const length = Number(match[1]);
    const start = boundary + headerEnd.length;
    if (buffer.length < start + length) return;
    const body = buffer.subarray(start, start + length);
    buffer = buffer.subarray(start + length);
    respond(JSON.parse(body.toString("utf8")));
  }
});
```

```ts
import { ModuleHost } from "@ai-mo-to/module-host";
import { encodeFrame, FrameDecoder } from "@ai-mo-to/module-sdk";

const frame = encodeFrame({ jsonrpc: "2.0", id: "1", result: { ok: true } });
const decoded = new FrameDecoder().push(frame); // framing utility only
const host = new ModuleHost({ moduleId: "example", entrypoint: "./module-entrypoint.js" });
await host.start();
const result = await host.invoke({ context_ref: "context-1", command: "ping", input: {} });
await host.stop();
console.log(decoded, result);
```

Set `entrypoint` to the absolute or correctly resolved path of the
`module-entrypoint.mjs` file above. Do not log to stdout. `ModuleHandler` is a
useful type for an implementation you write, but the SDK does not connect it to
stdin/stdout for you. Defaults are a 5-second request timeout, 1 MiB frames,
and 64 KiB of trailing stderr diagnostics; the host is supervision, not a
security sandbox.
