import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { validateProtocol } from "@ai-mo-to/protocol";

import { runCli, type CliIo } from "../src/cli.js";

const roots: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aimoto-cli-"));
  roots.push(root);
  return root;
}

function capture(): {
  io: CliIo;
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message)
    }
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("aimoto CLI", () => {
  it("creates and inspects the same workspace through JSON commands", async () => {
    const cwd = await temporaryDirectory();
    const createdOutput = capture();
    const createdExit = await runCli(
      [
        "workspace",
        "create",
        "Neighborhood Clean-up",
        "--root",
        "clean-up",
        "--json"
      ],
      createdOutput.io,
      {
        cwd,
        traceId: () => "d49b2144-17a8-4a1c-8f3e-01e92d6c6e5e"
      }
    );
    const createdEnvelope = JSON.parse(createdOutput.stdout[0] ?? "") as unknown;

    expect(createdExit).toBe(0);
    expect(validateProtocol("json-envelope", createdEnvelope).valid).toBe(true);
    expect(createdEnvelope).toMatchObject({
      ok: true,
      command: "workspace.create",
      data: {
        workspaceId: "neighborhood-clean-up",
        revision: 0,
        health: "ok"
      }
    });

    const inspectedOutput = capture();
    const inspectedExit = await runCli(
      ["inspect", "--workspace", "clean-up", "--json"],
      inspectedOutput.io,
      {
        cwd,
        traceId: () => "32d9999f-3703-48cb-8736-f4546697a21c"
      }
    );

    expect(inspectedExit).toBe(0);
    expect(JSON.parse(inspectedOutput.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "inspect",
      data: {
        workspaceId: "neighborhood-clean-up",
        revision: 0,
        health: "ok"
      }
    });
  });

  it("returns a stable JSON error for a missing workspace", async () => {
    const cwd = await temporaryDirectory();
    const output = capture();
    const exitCode = await runCli(
      ["inspect", "--json"],
      output.io,
      {
        cwd,
        traceId: () => "32d9999f-3703-48cb-8736-f4546697a21c"
      }
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(output.stdout[0] ?? "")).toMatchObject({
      ok: false,
      command: "inspect",
      error: {
        code: "WorkspaceNotFound"
      }
    });
  });

  it("stages a visible plan and applies only its exact digest", async () => {
    const cwd = await temporaryDirectory();
    const create = capture();
    await runCli(["workspace", "create", "Proposal Workspace", "--root", "proposal", "--json"], create.io, { cwd });

    const planned = capture();
    expect(await runCli(
      ["plan", "--workspace", "proposal", "--set-authority", "build", "--json"],
      planned.io,
      { cwd, traceId: () => "d49b2144-17a8-4a1c-8f3e-01e92d6c6e5e" }
    )).toBe(0);
    const proposal = JSON.parse(planned.stdout[0] ?? "").data;
    expect(proposal).toMatchObject({ status: "pending", baseRevision: 0 });

    const applied = capture();
    expect(await runCli([
      "apply", "--workspace", "proposal", "--proposal", proposal.proposalId,
      "--hash", proposal.changeSetDigest, "--json"
    ], applied.io, { cwd })).toBe(0);
    expect(JSON.parse(applied.stdout[0] ?? "")).toMatchObject({
      ok: true,
      data: { revision: 1, authorityMode: "build" }
    });
  });

  it("returns a machine-readable error for a nonexistent proposal", async () => {
    const cwd = await temporaryDirectory();
    const create = capture();
    await runCli(["workspace", "create", "Missing Proposal", "--root", "missing", "--json"], create.io, { cwd });
    const output = capture();

    expect(await runCli([
      "apply", "--workspace", "missing", "--proposal", "d49b2144-17a8-4a1c-8f3e-01e92d6c6e5e",
      "--hash", `sha256:${"a".repeat(64)}`, "--json"
    ], output.io, { cwd })).toBe(2);
    expect(JSON.parse(output.stdout[0] ?? "")).toMatchObject({
      ok: false,
      error: { code: "ProposalNotFound" }
    });
  });

  it("prints usage successfully for any command-level help request", async () => {
    const output = capture();
    expect(await runCli(["workspace", "create", "--help"], output.io)).toBe(0);
    expect(output.stdout[0]).toContain("aimoto workspace create");
  });
});
