import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export interface SnapshotObjectRef {
  readonly digest: string;
  readonly mediaType: "application/json" | "application/octet-stream";
  readonly size: number;
}

export interface SnapshotFileRef {
  readonly path: string;
  readonly object: SnapshotObjectRef;
}

export interface SnapshotManifest {
  readonly schemaVersion: 2;
  readonly workspaceId: string;
  readonly workspaceRevision: number;
  readonly workspaceVersion: SnapshotObjectRef;
  readonly fileManifest: SnapshotObjectRef;
  readonly files: readonly SnapshotFileRef[];
  readonly engineConfigurationRefs: readonly string[];
  readonly credentialBindingKeys: readonly string[];
}

export interface SnapshotInput {
  readonly workspaceId: string;
  readonly workspaceRevision: number;
  readonly workspaceVersion: unknown;
  readonly files: readonly {
    readonly path: string;
    readonly content: Uint8Array;
  }[];
  readonly engineConfigurationRefs?: readonly string[];
  readonly credentialBindingKeys?: readonly string[];
  readonly credentials?: never;
  readonly secrets?: never;
}

export interface CreatedSnapshot {
  readonly snapshotId: string;
  readonly path: string;
  readonly manifest: SnapshotManifest;
}

export interface SnapshotVerification {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly manifest?: SnapshotManifest;
}

export interface RestorePlan {
  readonly kind: "restore-as-new-version";
  readonly snapshotId: string;
  readonly workspaceId: string;
  readonly sourceRevision: number;
  readonly baseRevision: number;
  readonly targetRevision: number;
  readonly manifest: SnapshotManifest;
  readonly requiredFileDigests: readonly string[];
  readonly requiredCredentialBindingKeys: readonly string[];
}

export interface SnapshotSummary {
  readonly snapshotId: string;
  readonly workspaceId: string;
  readonly workspaceRevision: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Snapshot values must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`,
    ).join(",")}}`;
  }
  throw new TypeError("Snapshot values must be JSON-compatible");
}

function bytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalize(value), "utf8");
}

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertWorkspacePath(path: string): void {
  if (
    !path ||
    path.includes("\\") ||
    isAbsolute(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe workspace-relative path: ${path}`);
  }
}

function assertSafeInput(input: SnapshotInput): void {
  const candidate = input as SnapshotInput & Record<string, unknown>;
  if ("credentials" in candidate || "secrets" in candidate) {
    throw new Error("Credentials and secret values must not be included in snapshots");
  }
  if (!input.workspaceId || !Number.isSafeInteger(input.workspaceRevision) || input.workspaceRevision < 0) {
    throw new Error("Snapshot identity or revision is invalid");
  }
  const paths = new Set<string>();
  for (const file of input.files) {
    assertWorkspacePath(file.path);
    if (paths.has(file.path)) throw new Error(`Duplicate workspace file path: ${file.path}`);
    paths.add(file.path);
  }
}

async function putObject(
  root: string,
  content: Uint8Array,
  mediaType: SnapshotObjectRef["mediaType"],
): Promise<SnapshotObjectRef> {
  const objectDigest = digest(content);
  const directory = join(root, "objects");
  const path = join(directory, objectDigest);
  await mkdir(directory, { recursive: true });
  try {
    const existing = await readFile(path);
    if (digest(existing) !== objectDigest) throw new Error(`Corrupt object: ${objectDigest}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, path);
  }
  return { digest: objectDigest, mediaType, size: content.byteLength };
}

export async function createSnapshot(root: string, input: SnapshotInput): Promise<CreatedSnapshot> {
  assertSafeInput(input);
  const workspaceVersion = await putObject(root, bytes(input.workspaceVersion), "application/json");
  const files: SnapshotFileRef[] = [];
  for (const file of [...input.files].sort((left, right) => left.path.localeCompare(right.path))) {
    files.push({
      path: file.path,
      object: await putObject(root, file.content, "application/octet-stream"),
    });
  }
  const fileManifest = await putObject(
    root,
    bytes(files.map((file) => ({ path: file.path, digest: file.object.digest, size: file.object.size }))),
    "application/json",
  );
  const manifest: SnapshotManifest = {
    schemaVersion: 2,
    workspaceId: input.workspaceId,
    workspaceRevision: input.workspaceRevision,
    workspaceVersion,
    fileManifest,
    files,
    engineConfigurationRefs: [...(input.engineConfigurationRefs ?? [])].sort(),
    credentialBindingKeys: [...(input.credentialBindingKeys ?? [])].sort(),
  };
  const manifestBytes = bytes(manifest);
  const snapshotId = digest(manifestBytes);
  const snapshotPath = join(root, "snapshots", snapshotId);
  await mkdir(snapshotPath, { recursive: true });
  await writeFile(join(snapshotPath, "manifest.json"), manifestBytes, { flag: "wx" })
    .catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
      const existing = await readFile(join(snapshotPath, "manifest.json"));
      if (digest(existing) !== snapshotId) throw new Error(`Corrupt snapshot manifest: ${snapshotId}`);
    });
  return { snapshotId, path: snapshotPath, manifest };
}

function isObjectRef(value: unknown): value is SnapshotObjectRef {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SnapshotObjectRef>;
  return typeof candidate.digest === "string" &&
    (candidate.mediaType === "application/json" || candidate.mediaType === "application/octet-stream") &&
    Number.isSafeInteger(candidate.size) && (candidate.size ?? -1) >= 0;
}

function parseManifest(value: unknown): SnapshotManifest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<SnapshotManifest>;
  if (
    candidate.schemaVersion !== 2 ||
    typeof candidate.workspaceId !== "string" || !candidate.workspaceId ||
    !Number.isSafeInteger(candidate.workspaceRevision) || (candidate.workspaceRevision ?? -1) < 0 ||
    !isObjectRef(candidate.workspaceVersion) ||
    !isObjectRef(candidate.fileManifest) ||
    !Array.isArray(candidate.files) ||
    !Array.isArray(candidate.engineConfigurationRefs) ||
    !Array.isArray(candidate.credentialBindingKeys)
  ) return undefined;
  const seen = new Set<string>();
  for (const file of candidate.files) {
    if (!file || typeof file !== "object") return undefined;
    const entry = file as Partial<SnapshotFileRef>;
    if (typeof entry.path !== "string" || !isObjectRef(entry.object)) return undefined;
    try { assertWorkspacePath(entry.path); } catch { return undefined; }
    if (seen.has(entry.path)) return undefined;
    seen.add(entry.path);
  }
  if (!candidate.engineConfigurationRefs.every((ref) => typeof ref === "string") ||
      !candidate.credentialBindingKeys.every((key) => typeof key === "string")) return undefined;
  return candidate as SnapshotManifest;
}

function objectRefs(manifest: SnapshotManifest): SnapshotObjectRef[] {
  return [manifest.workspaceVersion, manifest.fileManifest, ...manifest.files.map((file) => file.object)];
}

/** Lists snapshots without trusting them: each returned entry includes integrity status. */
export async function listSnapshots(root: string): Promise<readonly SnapshotSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(join(root, "snapshots"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(entries.sort().map(async (snapshotId) => {
    const verification = await verifySnapshot(root, snapshotId);
    return {
      snapshotId,
      workspaceId: verification.manifest?.workspaceId ?? "unknown",
      workspaceRevision: verification.manifest?.workspaceRevision ?? -1,
      valid: verification.valid,
      errors: verification.errors,
    };
  }));
}

export async function verifySnapshot(root: string, snapshotId: string): Promise<SnapshotVerification> {
  const errors: string[] = [];
  let raw: Buffer;
  try {
    raw = await readFile(join(root, "snapshots", snapshotId, "manifest.json"));
  } catch {
    return { valid: false, errors: [`Missing snapshot manifest: ${snapshotId}`] };
  }
  if (digest(raw) !== snapshotId) errors.push("Snapshot manifest digest mismatch");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return { valid: false, errors: [...errors, "Snapshot manifest is not valid JSON"] };
  }
  const manifest = parseManifest(parsed);
  if (!manifest) return { valid: false, errors: [...errors, "Snapshot manifest contract is invalid"] };
  for (const reference of objectRefs(manifest)) {
    try {
      const content = await readFile(join(root, "objects", reference.digest));
      if (content.byteLength !== reference.size) errors.push(`Object size mismatch: ${reference.digest}`);
      if (digest(content) !== reference.digest) errors.push(`Object digest mismatch: ${reference.digest}`);
    } catch {
      errors.push(`Missing object: ${reference.digest}`);
    }
  }
  return { valid: errors.length === 0, errors, manifest };
}

async function readVerifiedJsonObject(
  root: string,
  snapshotId: string,
  select: (manifest: SnapshotManifest) => SnapshotObjectRef,
): Promise<{ readonly value: unknown; readonly digest: string; readonly snapshot: SnapshotManifest }> {
  const verification = await verifySnapshot(root, snapshotId);
  if (!verification.valid || !verification.manifest) {
    throw new Error(`Snapshot verification failed: ${verification.errors.join("; ")}`);
  }
  const reference = select(verification.manifest);
  const content = await readFile(join(root, "objects", reference.digest));
  return {
    value: JSON.parse(content.toString("utf8")) as unknown,
    digest: reference.digest,
    snapshot: verification.manifest,
  };
}

export async function readVerifiedWorkspaceVersion(root: string, snapshotId: string) {
  return readVerifiedJsonObject(root, snapshotId, (manifest) => manifest.workspaceVersion);
}

export async function readVerifiedFileManifest(root: string, snapshotId: string) {
  return readVerifiedJsonObject(root, snapshotId, (manifest) => manifest.fileManifest);
}

export async function planRestore(
  root: string,
  snapshotId: string,
  activeRevision: number,
): Promise<RestorePlan> {
  if (!Number.isSafeInteger(activeRevision) || activeRevision < 0) {
    throw new Error("Active revision is invalid");
  }
  const verification = await verifySnapshot(root, snapshotId);
  if (!verification.valid || !verification.manifest) {
    throw new Error(`Snapshot verification failed: ${verification.errors.join("; ")}`);
  }
  return Object.freeze({
    kind: "restore-as-new-version",
    snapshotId,
    workspaceId: verification.manifest.workspaceId,
    sourceRevision: verification.manifest.workspaceRevision,
    baseRevision: activeRevision,
    targetRevision: activeRevision + 1,
    manifest: verification.manifest,
    requiredFileDigests: verification.manifest.files.map((file) => file.object.digest),
    requiredCredentialBindingKeys: verification.manifest.credentialBindingKeys,
  });
}
