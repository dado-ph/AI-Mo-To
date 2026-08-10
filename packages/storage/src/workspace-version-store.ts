import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import type { WorkspaceManifest, WorkspaceVersion } from "@ai-mo-to/protocol";

import { readWorkspaceManifest, writeWorkspaceManifest } from "./workspace-store.js";

interface CapturedFile {
  path: string;
  digest: string;
}

interface StoredCapture {
  version: WorkspaceVersion;
  files: CapturedFile[];
}

export interface CaptureWorkspaceVersionInput {
  message: string;
}

const VERSION_DIRECTORY = join(".aimoto", "versions");

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function sha256File(path: string): Promise<string> {
  return sha256(await readFile(path));
}

function assertRelativePath(value: string): string[] {
  if (!value || value.includes("\\") || value.startsWith("/") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe workspace-relative path: ${value}`);
  }
  return value.split("/");
}

function assertVersionId(versionId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(versionId) || versionId === "." || versionId === "..") {
    throw new Error("The version id is invalid.");
  }
}

function childPath(root: string, parts: readonly string[]): string {
  const destination = resolve(root, ...parts);
  if (destination !== root && !destination.startsWith(`${root}${sep}`)) {
    throw new Error("A workspace path escapes its root.");
  }
  return destination;
}

async function workspaceRoot(root: string): Promise<string> {
  const resolved = await realpath(resolve(root));
  if (!(await lstat(resolved)).isDirectory()) throw new Error("The workspace root must be a directory.");
  return resolved;
}

function isSkipped(parts: readonly string[]): boolean {
  return (parts[0] === ".aimoto" && parts[1] === "versions") || parts.some((part) => part.startsWith(".aimoto-capture-"));
}

async function collectFiles(root: string, current = "", collected: CapturedFile[] = []): Promise<CapturedFile[]> {
  const directory = childPath(root, current ? assertRelativePath(current) : []);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = current ? `${current}/${entry.name}` : entry.name;
    const parts = assertRelativePath(path);
    if (isSkipped(parts)) continue;
    const source = childPath(root, parts);
    const details = await lstat(source);
    if (details.isSymbolicLink()) throw new Error(`Refusing to capture symbolic link: ${path}`);
    if (details.isDirectory()) await collectFiles(root, path, collected);
    else if (details.isFile()) collected.push({ path, digest: await sha256File(source) });
  }
  return collected;
}

async function readCapture(root: string, versionId: string): Promise<StoredCapture> {
  assertVersionId(versionId);
  const path = childPath(root, [...assertRelativePath(VERSION_DIRECTORY.replaceAll("\\", "/")), versionId, "version.json"]);
  const capture = JSON.parse(await readFile(path, "utf8")) as StoredCapture;
  if (!capture.version || capture.version.versionId !== versionId || !Array.isArray(capture.files)) throw new Error(`Version ${versionId} is invalid.`);
  const seen = new Set<string>();
  for (const file of capture.files) {
    assertRelativePath(file.path);
    if (!/^sha256:[a-f0-9]{64}$/.test(file.digest) || seen.has(file.path)) throw new Error(`Version ${versionId} has an invalid file manifest.`);
    seen.add(file.path);
  }
  return capture;
}

export async function listWorkspaceVersions(root: string): Promise<readonly WorkspaceVersion[]> {
  const canonicalRoot = await workspaceRoot(root);
  const versionsRoot = childPath(canonicalRoot, assertRelativePath(VERSION_DIRECTORY.replaceAll("\\", "/")));
  try {
    const entries = await readdir(versionsRoot, { withFileTypes: true });
    const versions: WorkspaceVersion[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".aimoto-capture-")) continue;
      versions.push((await readCapture(canonicalRoot, entry.name)).version);
    }
    return versions.sort((left, right) => left.revision - right.revision || left.createdAt.localeCompare(right.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function captureWorkspaceVersion(root: string, input: CaptureWorkspaceVersionInput & { parentVersionId?: string | null }): Promise<WorkspaceVersion> {
  if (!input.message.trim()) throw new Error("A version message is required.");
  const canonicalRoot = await workspaceRoot(root);
  const previousManifest = await readWorkspaceManifest(canonicalRoot);
  const priorVersions = await listWorkspaceVersions(canonicalRoot);
  const versionId = `version-${randomUUID()}`;
  const parentVersionId = input.parentVersionId === undefined ? previousManifest.currentVersionId : input.parentVersionId;
  if (parentVersionId !== null) assertVersionId(parentVersionId);
  const revision = Math.max(previousManifest.revision, ...priorVersions.map((version) => version.revision)) + 1;
  const nextManifest: WorkspaceManifest = { ...previousManifest, revision, currentVersionId: versionId };
  const versionsRoot = childPath(canonicalRoot, assertRelativePath(VERSION_DIRECTORY.replaceAll("\\", "/")));
  const temporaryDirectory = childPath(versionsRoot, [`.aimoto-capture-${randomUUID()}`]);
  const finalDirectory = childPath(versionsRoot, [versionId]);

  await writeWorkspaceManifest(canonicalRoot, nextManifest);
  try {
    await mkdir(join(temporaryDirectory, "files"), { recursive: true });
    const files = await collectFiles(canonicalRoot);
    for (const file of files) {
      const source = childPath(canonicalRoot, assertRelativePath(file.path));
      const destination = childPath(temporaryDirectory, ["files", ...assertRelativePath(file.path)]);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      file.digest = await sha256File(destination);
    }
    const version: WorkspaceVersion = {
      schemaVersion: 1,
      versionId,
      workspaceId: previousManifest.workspaceId,
      revision,
      createdAt: new Date().toISOString(),
      message: input.message,
      parentVersionId,
      fileManifestDigest: sha256(JSON.stringify(files))
    };
    await writeFile(join(temporaryDirectory, "version.json"), `${JSON.stringify({ version, files }, null, 2)}\n`, "utf8");
    await rename(temporaryDirectory, finalDirectory);
    return version;
  } catch (error) {
    await writeWorkspaceManifest(canonicalRoot, previousManifest);
    throw error;
  }
}

export async function restoreWorkspaceVersion(root: string, versionId: string): Promise<WorkspaceVersion> {
  const canonicalRoot = await workspaceRoot(root);
  const capture = await readCapture(canonicalRoot, versionId);
  const versionRoot = childPath(canonicalRoot, [...assertRelativePath(VERSION_DIRECTORY.replaceAll("\\", "/")), versionId, "files"]);
  for (const file of capture.files) {
    const parts = assertRelativePath(file.path);
    const source = childPath(versionRoot, parts);
    if (!(await lstat(source)).isFile() || await sha256File(source) !== file.digest) throw new Error(`Version ${versionId} failed its integrity check.`);
    const destination = childPath(canonicalRoot, parts);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = join(dirname(destination), `.aimoto-capture-${randomUUID()}-${basename(destination)}`);
    await copyFile(source, temporary);
    if (await sha256File(temporary) !== file.digest) throw new Error(`Version ${versionId} failed its integrity check.`);
    await rename(temporary, destination);
  }
  return captureWorkspaceVersion(canonicalRoot, { message: `Restore ${versionId}`, parentVersionId: versionId });
}
