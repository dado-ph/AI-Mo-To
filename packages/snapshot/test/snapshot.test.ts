import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createSnapshot, planRestore, verifySnapshot, type SnapshotInput } from "../src/index.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "aimoto-snapshot-"));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function fixture(): SnapshotInput {
  return {
    workspaceId: "workspace-1",
    workspaceRevision: 4,
    workspaceManifest: { name: "Test", modules: ["tasks"] },
    revisions: [{ revision: 0, reason: "workspace.created" }, { revision: 4, reason: "proposal.committed" }],
    modules: [{
      moduleId: "tasks",
      version: "1.0.0",
      bundle: Buffer.from("module bundle"),
      schema: { type: "object", required: ["title"] },
    }],
    data: { tasks: [{ title: "Ship recovery" }] },
    context: { "constraints.md": "Keep recovery non-destructive." },
    eventLogPosition: 18,
    engineConfigurationRefs: ["engine.default"],
    credentialBindingKeys: ["provider.openai"],
  };
}

describe("snapshot recovery", () => {
  it("creates deterministic content-addressed snapshots and verifies them", async () => {
    const directory = await root();
    const first = await createSnapshot(directory, fixture());
    const second = await createSnapshot(directory, fixture());
    expect(second.snapshotId).toBe(first.snapshotId);
    await expect(verifySnapshot(directory, first.snapshotId)).resolves.toMatchObject({
      valid: true,
      errors: [],
    });
  });

  it("detects changed object bytes", async () => {
    const directory = await root();
    const snapshot = await createSnapshot(directory, fixture());
    const objectPath = join(directory, "objects", snapshot.manifest.data.digest);
    await writeFile(objectPath, "tampered");
    const verification = await verifySnapshot(directory, snapshot.snapshotId);
    expect(verification.valid).toBe(false);
    expect(verification.errors.join(" ")).toContain("mismatch");
  });

  it("plans restoration as a new revision without changing the snapshot", async () => {
    const directory = await root();
    const snapshot = await createSnapshot(directory, fixture());
    const before = await readFile(join(snapshot.path, "manifest.json"), "utf8");
    const plan = await planRestore(directory, snapshot.snapshotId, 9);
    expect(plan).toMatchObject({
      kind: "restore-as-new-revision",
      sourceRevision: 4,
      baseRevision: 9,
      targetRevision: 10,
      requiredModuleBundleDigests: [snapshot.manifest.modules[0]!.bundle.digest],
      requiredCredentialBindingKeys: ["provider.openai"],
    });
    expect(await readFile(join(snapshot.path, "manifest.json"), "utf8")).toBe(before);
  });

  it("rejects credentials before writing a snapshot", async () => {
    const directory = await root();
    const unsafe = { ...fixture(), credentials: { token: "plaintext" } };
    await expect(createSnapshot(directory, unsafe as never)).rejects.toThrow(/Credentials/);
  });
});
