import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { digestBundle, normalizeBundleFiles } from "./digest.js";
import type {
  DryActivator,
  ExistingModuleSelector,
  FoundryRequest,
  FoundryResult,
  ModuleGenerator,
  ModulePlan,
  StagedModule,
  StaticValidator,
} from "./types.js";

export interface FoundryHooks {
  selector: ExistingModuleSelector;
  generator: ModuleGenerator;
  staticValidator: StaticValidator;
  dryActivator: DryActivator;
}

export class Foundry {
  constructor(
    private readonly stagingRoot: string,
    private readonly hooks: FoundryHooks,
  ) {}

  async stage(request: FoundryRequest, plan: ModulePlan): Promise<FoundryResult> {
    if (request.requestId !== plan.requestId) {
      throw new Error("Request and plan identifiers do not match");
    }

    const existing = await this.hooks.selector.select(plan);
    if (existing) {
      return {
        ok: true,
        proposal: { kind: "use-existing", requestId: request.requestId, plan, module: existing },
      };
    }

    const bundle = await this.hooks.generator.generate(plan);
    const digest = digestBundle(bundle.files);
    const directory = path.join(this.stagingRoot, digest.slice("sha256:".length));
    const stagedModule: StagedModule = {
      moduleId: bundle.moduleId,
      version: bundle.version,
      digest,
      directory,
    };
    await this.materialize(directory, bundle.files);

    const staticValidation = await this.hooks.staticValidator.validate(stagedModule);
    if (!staticValidation.ok) {
      return {
        ok: false,
        phase: "static-validation",
        plan,
        stagedModule,
        diagnostics: staticValidation.diagnostics,
      };
    }

    const disposableStateDirectory = path.join(directory, ".dry-activation");
    await mkdir(disposableStateDirectory, { recursive: true });
    const dryActivation = await this.hooks.dryActivator.activate(
      stagedModule,
      disposableStateDirectory,
    );
    if (!dryActivation.ok) {
      return {
        ok: false,
        phase: "dry-activation",
        plan,
        stagedModule,
        diagnostics: dryActivation.diagnostics,
      };
    }

    return {
      ok: true,
      proposal: {
        kind: "install-generated",
        requestId: request.requestId,
        plan,
        module: stagedModule,
        requestedCapabilities: [...bundle.requestedCapabilities],
        checks: { staticValidation, dryActivation },
      },
    };
  }

  private async materialize(
    finalDirectory: string,
    files: Parameters<typeof normalizeBundleFiles>[0],
  ): Promise<void> {
    const temporaryDirectory = `${finalDirectory}.partial-${process.pid}-${Date.now()}`;
    await mkdir(temporaryDirectory, { recursive: true });
    try {
      for (const file of normalizeBundleFiles(files)) {
        const destination = path.join(temporaryDirectory, ...file.path.split("/"));
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, file.bytes);
      }
      try {
        await rename(temporaryDirectory, finalDirectory);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EEXIST" || code === "ENOTEMPTY" || code === "EPERM" || code === "EACCES") {
          await rm(finalDirectory, { recursive: true, force: true });
          await rename(temporaryDirectory, finalDirectory);
        } else {
          throw error;
        }
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

