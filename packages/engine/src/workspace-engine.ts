import { access, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { validateProtocol, type WorkspaceManifest, type WorkspaceVersion } from "@ai-mo-to/protocol";
import {
  WorkspaceStore,
  captureWorkspaceVersion,
  initializeWorkspaceLayout,
  listWorkspaceVersions as listStoredWorkspaceVersions,
  readWorkspaceManifest,
  restoreWorkspaceVersion as restoreStoredWorkspaceVersion,
  workspaceDatabasePath,
  workspaceManifestPath,
  writeWorkspaceManifest,
} from "@ai-mo-to/storage";

import { EngineError } from "./errors.js";

export interface CreateWorkspaceInput {
  root: string;
  name: string;
  workspaceId?: string;
  now?: () => Date;
}

export interface WorkspaceInspection {
  root: string;
  schemaVersion: WorkspaceManifest["schemaVersion"];
  workspaceId: string;
  name: string;
  revision: number;
  createdAt: string;
  currentVersionId: string | null;
  health: "ok";
}

export interface WorkspaceMaturityFlags {
  prototype?: boolean;
  production?: boolean;
}

export interface PrepareImplementationRequestInput {
  root: string;
  request: string;
  maturity?: WorkspaceMaturityFlags;
}

export interface ImplementationBrief {
  workspaceRoot: string;
  workspaceId: string;
  request: string;
  instructions: string;
}

export interface CreateWorkspaceVersionInput {
  root: string;
  message: string;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  if (slug.length >= 3 && /^[a-z]/.test(slug)) return slug;
  return `workspace-${slug || "local"}`.slice(0, 64);
}

/**
 * Selects guidance from explicit workspace context only. The user's request is
 * deliberately not an input, so keywords cannot select an application type.
 */
export function selectImplementationRules(input: {
  workspaceRoot: string;
  notes: readonly string[];
  maturity?: WorkspaceMaturityFlags;
}): string {
  if (input.maturity?.prototype && input.maturity.production) {
    throw new EngineError("InvalidInput", "A workspace cannot be both prototype and production maturity.");
  }

  const rules = [
    `Work directly beneath the canonical workspace root: ${input.workspaceRoot}.`,
    "Do not write application files inside .aimoto/versions; that directory is reserved for explicit user-approved captures.",
    "Implement a real interactive UI with connected callbacks or scripts, suitable first-use, empty, loading, and error states, and only the files this workspace needs.",
    "Use Shadcn components where suitable, and verify the requested interface and behavior before reporting completion or asking whether to create a version.",
  ];
  const notes = input.notes.map((note) => note.trim()).filter(Boolean);
  if (notes.length > 0) rules.push(`Workspace notes:\n${notes.map((note) => `- ${note}`).join("\n")}`);
  if (input.maturity?.prototype) {
    rules.push("This workspace is explicitly marked as a prototype: favor a small working slice while keeping files understandable.");
  }
  if (input.maturity?.production) {
    rules.push("This workspace is explicitly marked as production: preserve existing behavior and include proportionate validation and recovery checks.");
  }
  rules.push(
    `AI-Mo-To has not built this workspace. You must now implement the workspace in ${input.workspaceRoot}. Continue until the requested UI and functions work.`,
  );
  return rules.join("\n\n");
}

function assertManifest(manifest: unknown): asserts manifest is WorkspaceManifest {
  const result = validateProtocol("workspace-manifest", manifest);
  if (!result.valid) {
    throw new EngineError("ValidationFailed", "The workspace manifest does not satisfy the v2 contract.", {
      errors: result.errors,
    });
  }
}

export class WorkspaceEngine {
  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceInspection> {
    const name = input.name.trim();
    if (!name) throw new EngineError("InvalidInput", "Workspace name cannot be empty.");

    const root = resolve(input.root);
    const manifestPath = workspaceManifestPath(root);
    try {
      await access(manifestPath);
      throw new EngineError("InvalidInput", `A workspace already exists at ${root}.`);
    } catch (error) {
      if (error instanceof EngineError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const manifest: WorkspaceManifest = {
      schemaVersion: 2,
      workspaceId: slugify(input.workspaceId ?? name),
      name,
      createdAt: (input.now ?? (() => new Date()))().toISOString(),
      revision: 0,
      currentVersionId: null,
    };
    assertManifest(manifest);

    await initializeWorkspaceLayout(root);
    try {
      await writeFile(join(root, ".aimoto", "notes.json"), "[]\n", { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      store.create(manifest);
      await writeWorkspaceManifest(root, manifest);
    } finally {
      store.close();
    }
    return this.inspectWorkspace(root);
  }

  async inspectWorkspace(rootInput: string): Promise<WorkspaceInspection> {
    const root = resolve(rootInput);
    let fileManifest: WorkspaceManifest;
    try {
      fileManifest = await readWorkspaceManifest(root);
    } catch {
      throw new EngineError("WorkspaceNotFound", `No AI-Mo-To workspace exists at ${root}.`);
    }
    assertManifest(fileManifest);

    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      const stored = store.inspect();
      if (!stored) {
        throw new EngineError("WorkspaceNotFound", `The workspace database at ${root} has no workspace metadata.`);
      }
      if (stored.workspaceId !== fileManifest.workspaceId) {
        throw new EngineError("ValidationFailed", "The workspace manifest and database disagree.", {
          manifestWorkspaceId: fileManifest.workspaceId,
          databaseWorkspaceId: stored.workspaceId,
        });
      }
      return {
        root,
        schemaVersion: fileManifest.schemaVersion,
        workspaceId: fileManifest.workspaceId,
        name: fileManifest.name,
        revision: fileManifest.revision,
        createdAt: fileManifest.createdAt,
        currentVersionId: fileManifest.currentVersionId,
        health: "ok",
      };
    } finally {
      store.close();
    }
  }

  async prepareImplementationRequest(input: PrepareImplementationRequestInput): Promise<ImplementationBrief> {
    const request = input.request.trim();
    if (!request) throw new EngineError("InvalidInput", "An implementation request is required.");
    const workspace = await this.inspectWorkspace(input.root);
    let notes: unknown;
    try {
      notes = JSON.parse(await readFile(join(workspace.root, ".aimoto", "notes.json"), "utf8"));
    } catch (error) {
      throw new EngineError("ValidationFailed", "The workspace notes could not be read.", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    if (!Array.isArray(notes) || notes.some((note) => typeof note !== "string")) {
      throw new EngineError("ValidationFailed", "Workspace notes must be a JSON array of strings.");
    }

    const rules = selectImplementationRules({
      workspaceRoot: workspace.root,
      notes,
      ...(input.maturity ? { maturity: input.maturity } : {}),
    });
    return {
      workspaceRoot: workspace.root,
      workspaceId: workspace.workspaceId,
      request,
      instructions: `Requested outcome:\n${request}\n\n${rules}`,
    };
  }

  async createWorkspaceVersion(input: CreateWorkspaceVersionInput): Promise<WorkspaceVersion> {
    const root = resolve(input.root);
    await this.inspectWorkspace(root);
    return captureWorkspaceVersion(root, { message: input.message });
  }

  async listWorkspaceVersions(rootInput: string): Promise<readonly WorkspaceVersion[]> {
    const root = resolve(rootInput);
    await this.inspectWorkspace(root);
    return listStoredWorkspaceVersions(root);
  }

  async restoreWorkspaceVersion(rootInput: string, versionId: string): Promise<WorkspaceVersion> {
    const root = resolve(rootInput);
    await this.inspectWorkspace(root);
    return restoreStoredWorkspaceVersion(root, versionId);
  }
}
