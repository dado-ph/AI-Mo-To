import { readFile, writeFile } from "node:fs/promises";
import { validateProtocol } from "@ai-mo-to/protocol";
import { Foundry, type FoundryHooks } from "./foundry.js";
import type { GeneratedModuleBundle, ModulePlan, StagedModule, ValidationResult } from "./types.js";

export const RESEARCH_COLLECTOR_MODULE_ID = "local.research-collector";

export function createResearchCollectorPlan(requestId: string): ModulePlan {
  return {
    requestId,
    moduleId: RESEARCH_COLLECTOR_MODULE_ID,
    displayName: "Research Collector",
    userOutcomes: ["Collect research paper excerpts and study notes", "Organize reading bookmarks and sources"],
    records: [{ name: "research-note", purpose: "A research excerpt or study note" }],
    views: [{ id: "notes", kind: "list" }, { id: "new-note", kind: "form" }],
    commands: ["save-note"],
    events: ["note-saved"],
    requestedCapabilities: ["data.research-note.propose"],
  };
}

export function createResearchCollectorBundle(): GeneratedModuleBundle {
  const manifest = {
    schemaVersion: "1.0.0",
    moduleId: RESEARCH_COLLECTOR_MODULE_ID,
    name: "Research Collector",
    version: "0.1.0",
    trustTier: "local-generated",
    collections: [
      { id: "research-note", schema: "schemas/research-note.schema.json", key: "noteId", indexes: ["title", "source"] },
    ],
    views: [
      { id: "notes", kind: "list", declaration: "views/notes.view.json" },
      { id: "new-note", kind: "form", declaration: "views/new-note.view.json" },
    ],
    commands: [{ id: "save-note", inputSchema: "schemas/research-note.schema.json" }],
    events: [{ id: "note-saved" }],
    capabilities: ["data.research-note.propose"],
    migrations: [],
  };

  return {
    moduleId: RESEARCH_COLLECTOR_MODULE_ID,
    version: "0.1.0",
    requestedCapabilities: manifest.capabilities,
    files: [
      { path: "module.json", content: JSON.stringify(manifest, null, 2) },
      {
        path: "schemas/research-note.schema.json",
        content: JSON.stringify({
          type: "object",
          required: ["noteId", "title", "content"],
          properties: {
            noteId: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            source: { type: "string" },
            tags: { type: "array", items: { type: "string" } }
          }
        }, null, 2)
      },
      { path: "views/notes.view.json", content: JSON.stringify({ title: "Research Notes", kind: "list", collection: "research-note" }, null, 2) },
      { path: "views/new-note.view.json", content: JSON.stringify({ title: "Save Research Note", kind: "form", collection: "research-note" }, null, 2) },
      { path: "handlers/index.js", content: "export const commands = ['save-note'];\n" },
    ],
  };
}

async function validateResearchCollector(module: StagedModule): Promise<ValidationResult> {
  try {
    const manifest = JSON.parse(await readFile(`${module.directory}/module.json`, "utf8"));
    const validation = validateProtocol("module-manifest", manifest);
    if (!validation.valid || manifest.moduleId !== RESEARCH_COLLECTOR_MODULE_ID) {
      return { ok: false, diagnostics: [{ code: "ManifestInvalid", message: "The generated Research Collector manifest is invalid." }] };
    }
    return { ok: true, diagnostics: [] };
  } catch {
    return { ok: false, diagnostics: [{ code: "ManifestUnreadable", message: "The generated Research Collector manifest cannot be read." }] };
  }
}

export function createResearchCollectorFoundry(stagingRoot: string): Foundry {
  const hooks: FoundryHooks = {
    selector: { select: async () => undefined },
    generator: { generate: async () => createResearchCollectorBundle() },
    staticValidator: { validate: validateResearchCollector },
    dryActivator: {
      activate: async (_module, disposableStateDirectory) => {
        await writeFile(`${disposableStateDirectory}/activation.json`, JSON.stringify({ activated: true }));
        return { ok: true, diagnostics: [] };
      }
    },
  };
  return new Foundry(stagingRoot, hooks);
}
