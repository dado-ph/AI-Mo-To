import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BundleFile } from "./types.js";

export interface NormalizedBundleFile {
  path: string;
  bytes: Uint8Array;
}

export function normalizeBundleFiles(files: BundleFile[]): NormalizedBundleFile[] {
  const seen = new Set<string>();
  return files
    .map((file) => {
      const normalized = file.path.replaceAll("\\", "/");
      if (
        normalized.length === 0 ||
        path.posix.isAbsolute(normalized) ||
        normalized.split("/").some((part) => part === ".." || part === "")
      ) {
        throw new Error(`Unsafe bundle path: ${file.path}`);
      }
      if (seen.has(normalized)) {
        throw new Error(`Duplicate bundle path: ${normalized}`);
      }
      seen.add(normalized);
      return {
        path: normalized,
        bytes:
          typeof file.content === "string"
            ? new TextEncoder().encode(file.content)
            : file.content,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function digestBundle(files: BundleFile[]): `sha256:${string}` {
  const hash = createHash("sha256");
  for (const file of normalizeBundleFiles(files)) {
    hash.update(file.path, "utf8");
    hash.update("\0");
    hash.update(String(file.bytes.byteLength), "ascii");
    hash.update("\0");
    hash.update(file.bytes);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

/** Recomputes a staged bundle digest from disk, excluding Foundry's disposable dry-run state. */
export async function verifyStagedModule(
  directory: string,
  expectedDigest: `sha256:${string}`,
): Promise<boolean> {
  const files: BundleFile[] = [];
  await collectStagedFiles(directory, "", files);
  return digestBundle(files) === expectedDigest;
}

/** Computes the canonical digest for a materialized module directory. */
export async function digestStagedModule(directory: string): Promise<`sha256:${string}`> {
  const files: BundleFile[] = [];
  await collectStagedFiles(directory, "", files);
  return digestBundle(files);
}

async function collectStagedFiles(
  directory: string,
  relativeDirectory: string,
  files: BundleFile[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (relativeDirectory === "" && entry.name === ".dry-activation") continue;
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Staged bundle contains a symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await collectStagedFiles(fullPath, relativePath, files);
    } else if (entry.isFile()) {
      files.push({ path: relativePath, content: await readFile(fullPath) });
    } else {
      throw new Error(`Staged bundle contains an unsupported entry: ${relativePath}`);
    }
  }
}
