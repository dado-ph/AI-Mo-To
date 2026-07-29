import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ModuleHost } from "../src/index.js";

const hosts: ModuleHost[] = [];
const entrypoint = fileURLToPath(new URL("./fixtures/handler.mjs", import.meta.url));

function host(options: { timeoutMs?: number; maximumDiagnosticBytes?: number } = {}) {
  const instance = new ModuleHost({
    moduleId: "test.handler",
    entrypoint,
    ...options
  });
  hosts.push(instance);
  return instance;
}

afterEach(async () => Promise.all(hosts.splice(0).map((item) => item.stop())));

describe("ModuleHost", () => {
  it("initializes and invokes with an opaque context reference", async () => {
    const instance = host();
    await instance.start();
    await expect(
      instance.invoke({ context_ref: "opaque:1", command: "echo", input: { ok: true } })
    ).resolves.toEqual({ context_ref: "opaque:1", input: { ok: true } });
  });

  it("isolates timeouts and crashes", async () => {
    // Process startup competes with the monorepo's parallel test workers on CI.
    // Keep the timeout behavior under test while giving initialization room to start.
    const timeout = host({ timeoutMs: 500 });
    await timeout.start();
    await expect(
      timeout.invoke({ context_ref: "opaque:2", command: "hang", input: null })
    ).rejects.toMatchObject({ code: "HostTimeout" });

    const crash = host();
    await crash.start();
    await expect(
      crash.invoke({ context_ref: "opaque:3", command: "crash", input: null })
    ).rejects.toMatchObject({ code: "HostExited" });
  });

  it("bounds stderr diagnostics", async () => {
    const instance = host({ maximumDiagnosticBytes: 32 });
    await instance.start();
    await instance.invoke({
      context_ref: "opaque:4",
      command: "diagnose",
      input: null
    });
    expect(Buffer.byteLength(instance.diagnostics)).toBeLessThanOrEqual(32);
  });
});
