import { readFile, writeFile } from "node:fs/promises";
import { validateProtocol } from "@ai-mo-to/protocol";
import { Foundry, type FoundryHooks } from "./foundry.js";
import type { GeneratedModuleBundle, ModulePlan, StagedModule, ValidationResult } from "./types.js";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "custom-item";
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function createDynamicAppPlan(requestId: string, requestText: string): ModulePlan {
  const cleanNeed = requestText.trim().replace(/^help me\s+/i, "").replace(/^i want to\s+/i, "");
  const slug = slugify(cleanNeed);
  const moduleId = `local.${slug}`;
  const displayName = cleanNeed.split(" ").slice(0, 4).map(capitalize).join(" ");
  const recordName = slug.split("-")[0] || "item";

  return {
    requestId,
    moduleId,
    displayName,
    userOutcomes: [`Track and manage ${cleanNeed}`, "Review history and log updates"],
    records: [{ name: recordName, purpose: `A recorded entry for ${cleanNeed}` }],
    views: [{ id: `${recordName}s`, kind: "list" }, { id: `new-${recordName}`, kind: "form" }],
    commands: [`create-${recordName}`],
    events: [`${recordName}-created`],
    requestedCapabilities: [`data.${recordName}.propose`],
  };
}

export function createDynamicAppBundle(plan: ModulePlan): GeneratedModuleBundle {
  const record = plan.records[0]?.name || "item";
  const manifest = {
    schemaVersion: "1.0.0",
    moduleId: plan.moduleId,
    name: plan.displayName,
    version: "0.1.0",
    trustTier: "local-generated",
    collections: [
      { id: record, schema: `schemas/${record}.schema.json`, key: `${record}Id`, indexes: ["name", "createdAt"] },
    ],
    views: [
      { id: `${record}s`, kind: "list", declaration: `views/${record}s.view.json` },
      { id: `new-${record}`, kind: "form", declaration: `views/new-${record}.view.json` },
    ],
    commands: [{ id: `create-${record}`, inputSchema: `schemas/${record}.schema.json` }],
    events: [{ id: `${record}-created` }],
    capabilities: [`data.${record}.propose`],
    migrations: [],
  };

  return {
    moduleId: plan.moduleId,
    version: "0.1.0",
    requestedCapabilities: manifest.capabilities,
    files: [
      { path: "module.json", content: JSON.stringify(manifest, null, 2) },
      {
        path: `schemas/${record}.schema.json`,
        content: JSON.stringify({
          type: "object",
          required: [`${record}Id`, "name"],
          properties: {
            [`${record}Id`]: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            createdAt: { type: "string" }
          }
        }, null, 2)
      },
      { path: `views/${record}s.view.json`, content: JSON.stringify({ title: `${plan.displayName} List`, kind: "list", collection: record }, null, 2) },
      { path: `views/new-${record}.view.json`, content: JSON.stringify({ title: `Add ${plan.displayName}`, kind: "form", collection: record }, null, 2) },
      { path: `handlers/index.js`, content: `export const commands = ['create-${record}'];\n` },
    ],
  };
}

async function validateDynamicApp(module: StagedModule, moduleId: string): Promise<ValidationResult> {
  try {
    const manifest = JSON.parse(await readFile(`${module.directory}/module.json`, "utf8"));
    const validation = validateProtocol("module-manifest", manifest);
    if (!validation.valid || manifest.moduleId !== moduleId) {
      return { ok: false, diagnostics: [{ code: "ManifestInvalid", message: "The generated module manifest is invalid." }] };
    }

    // PMP Rehearsal Check: Verify declared UI entrypoint if present
    const entryPath = manifest.entry || "ui/index.html";
    const fullEntryPath = `${module.directory}/${entryPath}`;
    try {
      const uiContent = await readFile(fullEntryPath, "utf8");
      if (!uiContent.trim()) {
        return { ok: false, diagnostics: [{ code: "EmptyUIEntrypoint", message: `The declared UI entrypoint (${entryPath}) is empty.` }] };
      }
    } catch {
      // If module declares traditional views without top-level entry, allow it for backwards compatibility
      if (manifest.entry) {
        return { ok: false, diagnostics: [{ code: "MissingUIEntrypoint", message: `The declared UI entrypoint (${entryPath}) does not exist on disk.` }] };
      }
    }

    return { ok: true, diagnostics: [] };
  } catch {
    return { ok: false, diagnostics: [{ code: "ManifestUnreadable", message: "The generated module manifest cannot be read." }] };
  }
}

export function createDynamicAppFoundry(stagingRoot: string, requestText: string): Foundry {
  const plan = createDynamicAppPlan("probe", requestText);
  const hooks: FoundryHooks = {
    selector: { select: async () => undefined },
    generator: { generate: async (p) => createDynamicAppBundle(p) },
    staticValidator: { validate: (m) => validateDynamicApp(m, plan.moduleId) },
    dryActivator: {
      activate: async (module, disposableStateDirectory) => {
        await writeFile(`${disposableStateDirectory}/activation.json`, JSON.stringify({ activated: true }));
        return { ok: true, diagnostics: [] };
      }
    },
  };
  return new Foundry(stagingRoot, hooks);
}

// Backwards-compatible exports
export const createDynamicTrackerPlan = createDynamicAppPlan;
export const createDynamicTrackerBundle = createDynamicAppBundle;
export const createDynamicTrackerFoundry = createDynamicAppFoundry;
