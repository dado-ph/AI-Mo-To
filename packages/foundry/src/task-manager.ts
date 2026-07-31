import { readFile, writeFile } from "node:fs/promises";
import { validateProtocol } from "@ai-mo-to/protocol";
import { Foundry, type FoundryHooks } from "./foundry.js";
import type { GeneratedModuleBundle, ModulePlan, StagedModule, ValidationResult } from "./types.js";

export const TASK_MANAGER_MODULE_ID = "local.task-manager";

export function createTaskManagerPlan(requestId: string): ModulePlan {
  return {
    requestId,
    moduleId: TASK_MANAGER_MODULE_ID,
    displayName: "Task Manager",
    userOutcomes: ["Create and manage daily tasks and action items", "Track task priorities and completion statuses"],
    records: [{ name: "task", purpose: "A task or action item to be completed" }],
    views: [{ id: "tasks", kind: "list" }, { id: "new-task", kind: "form" }],
    commands: ["create-task", "update-task-status"],
    events: ["task-created", "task-updated"],
    requestedCapabilities: ["data.task.propose"],
  };
}

export function createTaskManagerBundle(): GeneratedModuleBundle {
  const manifest = {
    schemaVersion: "1.0.0",
    moduleId: TASK_MANAGER_MODULE_ID,
    name: "Task Manager",
    version: "0.1.0",
    trustTier: "local-generated",
    collections: [
      { id: "task", schema: "schemas/task.schema.json", key: "taskId", indexes: ["title", "status", "priority"] },
    ],
    views: [
      { id: "tasks", kind: "list", declaration: "views/tasks.view.json" },
      { id: "new-task", kind: "form", declaration: "views/new-task.view.json" },
    ],
    commands: [
      { id: "create-task", inputSchema: "schemas/task.schema.json" },
      { id: "update-task-status", inputSchema: "schemas/task-status.schema.json" }
    ],
    events: [{ id: "task-created" }, { id: "task-updated" }],
    capabilities: ["data.task.propose"],
    migrations: [],
  };

  return {
    moduleId: TASK_MANAGER_MODULE_ID,
    version: "0.1.0",
    requestedCapabilities: manifest.capabilities,
    files: [
      { path: "module.json", content: JSON.stringify(manifest, null, 2) },
      {
        path: "schemas/task.schema.json",
        content: JSON.stringify({
          type: "object",
          required: ["taskId", "title"],
          properties: {
            taskId: { type: "string" },
            title: { type: "string" },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            status: { type: "string", enum: ["todo", "in-progress", "done"] },
            dueDate: { type: "string" }
          }
        }, null, 2)
      },
      {
        path: "schemas/task-status.schema.json",
        content: JSON.stringify({
          type: "object",
          required: ["taskId", "status"],
          properties: {
            taskId: { type: "string" },
            status: { type: "string", enum: ["todo", "in-progress", "done"] }
          }
        }, null, 2)
      },
      { path: "views/tasks.view.json", content: JSON.stringify({ title: "Tasks", kind: "list", collection: "task" }, null, 2) },
      { path: "views/new-task.view.json", content: JSON.stringify({ title: "New Task", kind: "form", collection: "task" }, null, 2) },
      { path: "handlers/index.js", content: "export const commands = ['create-task', 'update-task-status'];\n" },
    ],
  };
}

async function validateTaskManager(module: StagedModule): Promise<ValidationResult> {
  try {
    const manifest = JSON.parse(await readFile(`${module.directory}/module.json`, "utf8"));
    const validation = validateProtocol("module-manifest", manifest);
    if (!validation.valid || manifest.moduleId !== TASK_MANAGER_MODULE_ID) {
      return { ok: false, diagnostics: [{ code: "ManifestInvalid", message: "The generated Task Manager manifest is invalid." }] };
    }
    return { ok: true, diagnostics: [] };
  } catch {
    return { ok: false, diagnostics: [{ code: "ManifestUnreadable", message: "The generated Task Manager manifest cannot be read." }] };
  }
}

export function createTaskManagerFoundry(stagingRoot: string): Foundry {
  const hooks: FoundryHooks = {
    selector: { select: async () => undefined },
    generator: { generate: async () => createTaskManagerBundle() },
    staticValidator: { validate: validateTaskManager },
    dryActivator: {
      activate: async (_module, disposableStateDirectory) => {
        await writeFile(`${disposableStateDirectory}/activation.json`, JSON.stringify({ activated: true }));
        return { ok: true, diagnostics: [] };
      }
    },
  };
  return new Foundry(stagingRoot, hooks);
}
