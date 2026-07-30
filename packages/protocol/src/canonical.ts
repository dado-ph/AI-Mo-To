import { createHash } from "node:crypto";

import type { ChangeSet, Sha256Digest } from "./types.js";

/**
 * Deterministic JSON serialization for values allowed in protocol payloads.
 * Object keys are lexicographically sorted; array order is deliberately retained.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON requires finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    ).join(",")}}`;
  }
  throw new TypeError("Canonical JSON requires JSON-compatible values");
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalJson(value), "utf8");
}

export function sha256Digest(value: unknown): Sha256Digest {
  const digest = createHash("sha256").update(canonicalJsonBytes(value)).digest("hex");
  return `sha256:${digest}`;
}

/** The digest is over the full immutable ChangeSet, including its identity and base revision. */
export function digestChangeSet(changeSet: ChangeSet): Sha256Digest {
  return sha256Digest(changeSet);
}

export function hasMatchingChangeSetDigest(
  changeSet: ChangeSet,
  digest: Sha256Digest
): boolean {
  return digestChangeSet(changeSet) === digest;
}
