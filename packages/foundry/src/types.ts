export interface FoundryRequest {
  requestId: string;
  workspaceId: string;
  text: string;
}

export interface ModulePlan {
  requestId: string;
  moduleId: string;
  displayName: string;
  userOutcomes: string[];
  records: Array<{ name: string; purpose: string }>;
  views: Array<{ id: string; kind: string }>;
  commands: string[];
  events: string[];
  requestedCapabilities: string[];
}

export interface ExistingModule {
  moduleId: string;
  version: string;
  digest: `sha256:${string}`;
}

export interface BundleFile {
  path: string;
  content: string | Uint8Array;
}

export interface GeneratedModuleBundle {
  moduleId: string;
  version: string;
  requestedCapabilities: string[];
  files: BundleFile[];
}

export interface ValidationDiagnostic {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: ValidationDiagnostic[];
}

export interface StagedModule {
  moduleId: string;
  version: string;
  digest: `sha256:${string}`;
  directory: string;
}

export interface ExistingModuleSelector {
  select(plan: ModulePlan): Promise<ExistingModule | undefined>;
}

export interface ModuleGenerator {
  generate(plan: ModulePlan): Promise<GeneratedModuleBundle>;
}

export interface StaticValidator {
  validate(module: StagedModule): Promise<ValidationResult>;
}

export interface DryActivator {
  activate(
    module: StagedModule,
    disposableStateDirectory: string,
  ): Promise<ValidationResult>;
}

export type FoundryProposal =
  | {
      kind: "use-existing";
      requestId: string;
      plan: ModulePlan;
      module: ExistingModule;
    }
  | {
      kind: "install-generated";
      requestId: string;
      plan: ModulePlan;
      module: StagedModule;
      requestedCapabilities: string[];
      checks: {
        staticValidation: ValidationResult;
        dryActivation: ValidationResult;
      };
    };

export interface FoundryFailure {
  ok: false;
  phase: "static-validation" | "dry-activation";
  plan: ModulePlan;
  stagedModule: StagedModule;
  diagnostics: ValidationDiagnostic[];
}

export type FoundryResult =
  | { ok: true; proposal: FoundryProposal }
  | FoundryFailure;

/** Inputs owned by the caller that binds a Foundry proposal to a workspace revision. */
export interface FoundryInstallChangeSetInput {
  workspaceId: string;
  baseRevision: number;
  changeSetId: string;
  operationId: string;
  createdAt: string;
}
