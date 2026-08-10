import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  captureWorkspaceVersion,
  createMinimalWorkspace,
  listWorkspaceVersions,
  restoreWorkspaceVersion
} from "../src/index.js";

async function writeApplicationFile(root: string, relativePath: string, content: string): Promise<void> {
  const destination = join(root, ...relativePath.split("/"));
  await mkdir(join(destination, ".."), { recursive: true });
  await writeFile(destination, content, "utf8");
}

describe("workspace version store", () => {
  it("captures application files without default folders and restores them", async () => {
    const root = await mkdtemp(join(tmpdir(), "aimoto-workspace-version-"));
    await createMinimalWorkspace(root, "Garden");
    await writeApplicationFile(root, "ui/index.html", "<button>Water</button>");

    const version = await captureWorkspaceVersion(root, { message: "Add garden UI" });
    await writeApplicationFile(root, "ui/index.html", "changed");

    const restored = await restoreWorkspaceVersion(root, version.versionId);

    await expect(readFile(join(root, "ui", "index.html"), "utf8")).resolves.toBe("<button>Water</button>");
    await expect(access(join(root, "files"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(restored.parentVersionId).toBe(version.versionId);
  });

  it("keeps prior versions and excludes version storage from a later capture", async () => {
    const root = await mkdtemp(join(tmpdir(), "aimoto-workspace-version-"));
    await createMinimalWorkspace(root, "Garden");
    await writeApplicationFile(root, "ui/index.html", "first");
    const first = await captureWorkspaceVersion(root, { message: "First UI" });

    await writeApplicationFile(root, "ui/index.html", "second");
    const second = await captureWorkspaceVersion(root, { message: "Second UI" });
    await writeApplicationFile(root, "ui/index.html", "changed again");
    await restoreWorkspaceVersion(root, first.versionId);

    const versions = await listWorkspaceVersions(root);
    expect(versions.map((version) => version.versionId)).toEqual([
      first.versionId,
      second.versionId,
      expect.any(String)
    ]);
    await expect(readFile(join(root, ".aimoto", "versions", first.versionId, "files", "ui", "index.html"), "utf8")).resolves.toBe("first");
    await expect(access(join(root, ".aimoto", "versions", second.versionId, "files", ".aimoto", "versions"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a version id that escapes the workspace version directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "aimoto-workspace-version-"));
    await createMinimalWorkspace(root, "Garden");

    await expect(restoreWorkspaceVersion(root, "../outside")).rejects.toThrow(/version id/i);
  });
});
