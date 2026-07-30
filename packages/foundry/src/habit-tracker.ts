import { readFile, writeFile } from "node:fs/promises";

import { validateProtocol } from "@ai-mo-to/protocol";

import { Foundry, type FoundryHooks } from "./foundry.js";
import type { GeneratedModuleBundle, ModulePlan, StagedModule, ValidationResult } from "./types.js";

export const HABIT_TRACKER_MODULE_ID = "local.habit-tracker";

/**
 * The deterministic local stand-in for the first agent proof. It deliberately
 * has no network or model dependency: the request is captured for review while
 * the generated, inspectable Habit Tracker bundle is always the same.
 */
export function createHabitTrackerPlan(requestId: string): ModulePlan {
  return {
    requestId,
    moduleId: HABIT_TRACKER_MODULE_ID,
    displayName: "Habit Tracker",
    userOutcomes: ["Create habits and mark their daily completion", "Review a simple completion history"],
    records: [{ name: "habit", purpose: "A habit the person wants to practice" }, { name: "habit-entry", purpose: "A dated completion record" }],
    views: [{ id: "habits", kind: "list" }, { id: "daily-check-in", kind: "form" }, { id: "history", kind: "timeline" }],
    commands: ["create-habit", "log-completion"],
    events: ["habit-created", "completion-logged"],
    requestedCapabilities: ["data.habit.propose", "data.habit-entry.propose"],
  };
}

export function createHabitTrackerBundle(): GeneratedModuleBundle {
  const manifest = {
    schemaVersion: "1.0.0",
    moduleId: HABIT_TRACKER_MODULE_ID,
    name: "Habit Tracker",
    version: "0.1.0",
    trustTier: "local-generated",
    collections: [
      { id: "habit", schema: "schemas/habit.schema.json", key: "habitId", indexes: ["name"] },
      { id: "habit-entry", schema: "schemas/habit-entry.schema.json", key: "entryId", indexes: ["habitId", "completedOn"] },
    ],
    views: [
      { id: "habits", kind: "list", declaration: "views/habits.view.json" },
      { id: "daily-check-in", kind: "form", declaration: "views/daily-check-in.view.json" },
      { id: "history", kind: "timeline", declaration: "views/history.view.json" },
    ],
    commands: [{ id: "create-habit", inputSchema: "schemas/habit.schema.json" }, { id: "log-completion", inputSchema: "schemas/habit-entry.schema.json" }],
    events: [{ id: "habit-created" }, { id: "completion-logged" }],
    capabilities: ["data.habit.propose", "data.habit-entry.propose"],
    migrations: [],
  };
  return {
    moduleId: HABIT_TRACKER_MODULE_ID,
    version: "0.1.0",
    requestedCapabilities: manifest.capabilities,
    files: [
      { path: "module.json", content: JSON.stringify(manifest, null, 2) },
      { path: "schemas/habit.schema.json", content: JSON.stringify({ type: "object", required: ["habitId", "name"], properties: { habitId: { type: "string" }, name: { type: "string" } } }, null, 2) },
      { path: "schemas/habit-entry.schema.json", content: JSON.stringify({ type: "object", required: ["entryId", "habitId", "completedOn"], properties: { entryId: { type: "string" }, habitId: { type: "string" }, completedOn: { type: "string", format: "date" } } }, null, 2) },
      { path: "views/habits.view.json", content: JSON.stringify({ title: "Habits", kind: "list", collection: "habit" }, null, 2) },
      { path: "views/daily-check-in.view.json", content: JSON.stringify({ title: "Daily check-in", kind: "form", collection: "habit-entry" }, null, 2) },
      { path: "views/history.view.json", content: JSON.stringify({ title: "Completion history", kind: "timeline", collection: "habit-entry" }, null, 2) },
      { path: "handlers/index.js", content: "export const commands = ['create-habit', 'log-completion'];\n" },
    ],
  };
}

async function validateHabitTracker(module: StagedModule): Promise<ValidationResult> {
  try {
    const manifest = JSON.parse(await readFile(`${module.directory}/module.json`, "utf8"));
    const validation = validateProtocol("module-manifest", manifest);
    if (!validation.valid || manifest.moduleId !== HABIT_TRACKER_MODULE_ID) {
      return { ok: false, diagnostics: [{ code: "ManifestInvalid", message: "The generated Habit Tracker manifest is invalid." }] };
    }
    return { ok: true, diagnostics: [] };
  } catch {
    return { ok: false, diagnostics: [{ code: "ManifestUnreadable", message: "The generated Habit Tracker manifest cannot be read." }] };
  }
}

/** Creates a Foundry whose generation, validation, and dry activation are all local and deterministic. */
export function createHabitTrackerFoundry(stagingRoot: string): Foundry {
  const hooks: FoundryHooks = {
    selector: { select: async () => undefined },
    generator: { generate: async () => createHabitTrackerBundle() },
    staticValidator: { validate: validateHabitTracker },
    dryActivator: { activate: async (_module, disposableStateDirectory) => {
      await writeFile(`${disposableStateDirectory}/activation.json`, JSON.stringify({ activated: true }));
      return { ok: true, diagnostics: [] };
    } },
  };
  return new Foundry(stagingRoot, hooks);
}
