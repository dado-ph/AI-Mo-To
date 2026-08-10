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
    workspaceVersion: {
      schemaVersion: 1,
      versionId: "version-4",
      workspaceId: "workspace-1",
      revision: 4,
      createdAt: "2026-08-10T00:00:00.000Z",
      message: "Initial UI",
      parentVersionId: "version-3",
      fileManifestDigest: "sha256:fixture",
    },
    files: [
      { path: ".aimoto/notes.json", content: Buffer.from("[]\n") },
      { path: "ui/index.html", content: Buffer.from("<button>Water</button>") },
    ],
    engineConfigurationRefs: ["engine.default"],
    credentialBindingKeys: ["provider.openai"],
  };
}

describe("snapshot recovery", () => {
  it("creates deterministic filesystem snapshots without module bundles", async () => {
    const directory = await root();
    const first = await createSnapshot(directory, fixture());
    const second = await createSnapshot(directory, fixture());
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(first.manifest).not.toHaveProperty("modules");
    expect(first.manifest.files.map((file) => file.path)).toEqual([
      ".aimoto/notes.json",
      "ui/index.html",
    ]);
    await expect(verifySnapshot(directory, first.snapshotId)).resolves.toMatchObject({
      valid: true,
      errors: [],
    });
  });

  it("detects changed captured file bytes", async () => {
    const directory = await root();
    const snapshot = await createSnapshot(directory, fixture());
    const objectPath = join(directory, "objects", snapshot.manifest.files[1]!.object.digest);
    await writeFile(objectPath, "tampered");
    const verification = await verifySnapshot(directory, snapshot.snapshotId);
    expect(verification.valid).toBe(false);
    expect(verification.errors.join(" ")).toContain("mismatch");
  });

  it("plans restoration as a new version without changing the snapshot", async () => {
    const directory = await root();
    const snapshot = await createSnapshot(directory, fixture());
    const before = await readFile(join(snapshot.path, "manifest.json"), "utf8");
    const plan = await planRestore(directory, snapshot.snapshotId, 9);
    expect(plan).toMatchObject({
      kind: "restore-as-new-version",
      sourceRevision: 4,
      baseRevision: 9,
      targetRevision: 10,
      requiredFileDigests: snapshot.manifest.files.map((file) => file.object.digest),
      requiredCredentialBindingKeys: ["provider.openai"],
    });
    expect(await readFile(join(snapshot.path, "manifest.json"), "utf8")).toBe(before);
  });

  it("rejects unsafe paths and credentials before writing a snapshot", async () => {
    const directory = await root();
    const unsafePath = { ...fixture(), files: [{ path: "../escape", content: Buffer.from("bad") }] };
    await expect(createSnapshot(directory, unsafePath)).rejects.toThrow(/path/i);
    const unsafeCredentials = { ...fixture(), credentials: { token: "plaintext" } };
    await expect(createSnapshot(directory, unsafeCredentials as never)).rejects.toThrow(/Credentials/);
  });
});
