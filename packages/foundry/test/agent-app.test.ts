import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocateAgentAppRepository, DEFAULT_AGENT_GUIDE, runAgent, createCodexCliProvider } from "../src/index.js";

describe("agent app repository", () => {
  it("allocates an isolated repository with foundry context", async () => {
    const root = await mkdtemp(join(tmpdir(), "aimoto-agent-"));
    const app = await allocateAgentAppRepository(root, "demo", "Build a tiny tool", DEFAULT_AGENT_GUIDE);
    expect(app.root).toBe(join(root, "apps", "demo"));
    expect(await readFile(app.promptFile, "utf8")).toContain("Build a tiny tool");
    expect(await readFile(app.manifestFile, "utf8")).toContain('"status": "building"');
  });

  it("keeps provider execution scoped to the allocated root", async () => {
    const root = await mkdtemp(join(tmpdir(), "aimoto-agent-"));
    const app = await allocateAgentAppRepository(root, "demo", "x", DEFAULT_AGENT_GUIDE);
    const result = await runAgent({ name: "test", run: async input => ({ exitCode: input.repositoryRoot === app.root ? 0 : 1 }) }, app);
    expect(result.exitCode).toBe(0);
  });

  it("runs the Codex-compatible provider with a closed prompt stream and app cwd", async () => {
    const root = await mkdtemp(join(tmpdir(), "aimoto-agent-"));
    const app = await allocateAgentAppRepository(root, "demo", "x", DEFAULT_AGENT_GUIDE);
    const provider = createCodexCliProvider({
      command: process.execPath,
      args: ["-e", "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>require('fs').writeFileSync('agent-output.txt',s.includes('User request')?'ok':'bad'));"],
    });
    const result = await runAgent(provider, app);
    expect(result.exitCode).toBe(0);
    expect(await readFile(join(app.root, "agent-output.txt"), "utf8")).toBe("ok");
  });
});
