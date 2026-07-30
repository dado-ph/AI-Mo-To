import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateProtocol } from "@ai-mo-to/protocol";
import type { NativePrimitive, NativeViewDeclaration } from "../src/index.js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const supported = new Set<NativePrimitive>([
  "form", "list", "table", "detail", "timeline", "action-bar", "tabs",
  "drawer", "status-badge", "file-picker", "text", "field", "action"
]);

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(`${repositoryRoot}/${path}`, "utf8"));
}

function primitives(view: NativeViewDeclaration): NativePrimitive[] {
  const result: NativePrimitive[] = [];
  const visit = (node: NativeViewDeclaration["root"]) => {
    result.push(node.type);
    node.children?.forEach(visit);
  };
  visit(view.root);
  return result;
}

describe("built-in declarative modules", () => {
  for (const moduleName of ["files", "tasks"]) {
    it(`${moduleName} has a valid static manifest`, async () => {
      const manifest = await json(`modules/${moduleName}/module.json`);
      expect(validateProtocol("module-manifest", manifest)).toEqual({
        valid: true,
        errors: []
      });
      expect(manifest).not.toHaveProperty("handler");
    });
  }

  it("uses only SDK native view primitives", async () => {
    const paths = [
      "modules/files/views/browser.view.json",
      "modules/files/views/detail.view.json",
      "modules/tasks/views/task-list.view.json",
      "modules/tasks/views/task-form.view.json"
    ];
    for (const path of paths) {
      const view = (await json(path)) as NativeViewDeclaration;
      expect(view.schemaVersion).toBe("1.0.0");
      expect(primitives(view).every((item) => supported.has(item))).toBe(true);
    }
  });
});
