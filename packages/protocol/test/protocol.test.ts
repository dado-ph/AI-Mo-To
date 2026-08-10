import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  validateProtocol,
  type ProtocolSchema
} from "../src/index.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

async function fixture(path: string): Promise<unknown> {
  const content = await readFile(resolve(repositoryRoot, "fixtures/protocol", path), "utf8");
  return JSON.parse(content) as unknown;
}

describe("protocol conformance fixtures", () => {
  const validFixtures: Array<[ProtocolSchema, string]> = [
    ["workspace-manifest", "valid/workspace.json"],
    ["json-envelope", "valid/json-envelope.json"]
  ];

  it.each(validFixtures)("accepts the %s fixture", async (schema, path) => {
    const result = validateProtocol(schema, await fixture(path));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("requires error envelopes to exclude data", () => {
    const result = validateProtocol("json-envelope", {
      envelopeVersion: "1.0.0",
      ok: false,
      command: "apply",
      traceId: "32d9999f-3703-48cb-8736-f4546697a21c",
      data: {},
      error: {
        code: "ProposalStale",
        message: "The workspace revision changed."
      }
    });
    expect(result.valid).toBe(false);
  });

  it("accepts every error code emitted by the CLI engine boundary", () => {
    const result = validateProtocol("json-envelope", {
      envelopeVersion: "1.0.0",
      ok: false,
      command: "apply",
      traceId: "32d9999f-3703-48cb-8736-f4546697a21c",
      error: {
        code: "ProposalNotFound",
        message: "The proposal does not exist."
      }
    });
    expect(result.valid).toBe(true);
  });

  it("canonicalizes object keys deterministically", () => {
    expect(canonicalJson({ zebra: [true, null], alpha: { b: 2, a: 1 } }))
      .toBe('{"alpha":{"a":1,"b":2},"zebra":[true,null]}');
  });
});
