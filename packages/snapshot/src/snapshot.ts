import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface SnapshotObjectRef {
  readonly digest: string;
  readonly mediaType: "application/json" | "application/octet-stream";
  readonly size: number;
}

export interface SnapshotModule {
  readonly moduleId: string;
  readonly version: string;
  readonly bundle: SnapshotObjectRef;
  readonly schema: SnapshotObjectRef;
}

export interface SnapshotManifest {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly workspaceRevision: number;
  readonly workspaceManifest: SnapshotObjectRef;
  readonly modules: readonly SnapshotModule[];
  readonly data: SnapshotObjectRef;
  readonly context: SnapshotObjectRef;
  readonly eventLogPosition: number;
  readonly engineConfigurationRefs: readonly string[];
  readonly credentialBindingKeys: readonly string[];
}

export interface SnapshotInput {
  readonly workspaceId: string;
  readonly workspaceRevision: number;
  readonly workspaceManifest: unknown;
  readonly modules: readonly {
    readonly moduleId: string;
    readonly version: string;
    readonly bundle: Uint8Array;
    readonly schema: unknown;
  }[];
  readonly data: unknown;
  readonly context: Readonly<Record<string, string>>;
  readonly eventLogPosition: number;
  readonly engineConfigurationRefs: readonly string[];
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
  readonly kind: "restore-as-new-revision";
  readonly snapshotId: string;
  readonly workspaceId: string;
  readonly sourceRevision: number;
  readonly baseRevision: number;
  readonly targetRevision: number;
  readonly manifest: SnapshotManifest;
  readonly requiredCredentialBindingKeys: readonly string[];
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

function assertSafeInput(input: SnapshotInput): void {
  const candidate = input as SnapshotInput & Record<string, unknown>;
  if ("credentials" in candidate || "secrets" in candidate) {
    throw new Error("Credentials and secret values must not be included in snapshots");
  }
  if (!input.workspaceId || !Number.isSafeInteger(input.workspaceRevision) ||
      input.workspaceRevision < 0 || !Number.isSafeInteger(input.eventLogPosition) ||
      input.eventLogPosition < 0) {
    throw new Error("Snapshot identity, revision, or event position is invalid");
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
  const workspaceManifest = await putObject(root, bytes(input.workspaceManifest), "application/json");
  const data = await putObject(root, bytes(input.data), "application/json");
  const context = await putObject(root, bytes(input.context), "application/json");
  const modules: SnapshotModule[] = [];
  for (const module of [...input.modules].sort((a, b) => a.moduleId.localeCompare(b.moduleId))) {
    modules.push({
      moduleId: module.moduleId,
      version: module.version,
      bundle: await putObject(root, module.bundle, "application/octet-stream"),
      schema: await putObject(root, bytes(module.schema), "application/json"),
    });
  }
  const manifest: SnapshotManifest = {
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    workspaceRevision: input.workspaceRevision,
    workspaceManifest,
    modules,
    data,
    context,
    eventLogPosition: input.eventLogPosition,
    engineConfigurationRefs: [...input.engineConfigurationRefs].sort(),
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

function objectRefs(manifest: SnapshotManifest): SnapshotObjectRef[] {
  return [
    manifest.workspaceManifest,
    manifest.data,
    manifest.context,
    ...manifest.modules.flatMap((module) => [module.bundle, module.schema]),
  ];
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
  let manifest: SnapshotManifest;
  try {
    manifest = JSON.parse(raw.toString("utf8")) as SnapshotManifest;
  } catch {
    return { valid: false, errors: [...errors, "Snapshot manifest is not valid JSON"] };
  }
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
  for (const module of verification.manifest.modules) {
    await stat(join(root, "objects", module.bundle.digest));
  }
  return Object.freeze({
    kind: "restore-as-new-revision",
    snapshotId,
    workspaceId: verification.manifest.workspaceId,
    sourceRevision: verification.manifest.workspaceRevision,
    baseRevision: activeRevision,
    targetRevision: activeRevision + 1,
    manifest: verification.manifest,
    requiredCredentialBindingKeys: verification.manifest.credentialBindingKeys,
  });
}
