import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import changeSetSchema from "../schemas/change-set.schema.json" with { type: "json" };
import jsonEnvelopeSchema from "../schemas/json-envelope.schema.json" with { type: "json" };
import moduleManifestSchema from "../schemas/module-manifest.schema.json" with { type: "json" };
import approvalRecordSchema from "../schemas/approval-record.schema.json" with { type: "json" };
import proposalRecordSchema from "../schemas/proposal-record.schema.json" with { type: "json" };
import workspaceManifestSchema from "../schemas/workspace-manifest.schema.json" with { type: "json" };

export type ProtocolSchema =
  | "workspace-manifest"
  | "module-manifest"
  | "change-set"
  | "proposal-record"
  | "approval-record"
  | "json-envelope";

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true
});
ajv.addFormat(
  "date-time",
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
);
ajv.addFormat(
  "uuid",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
);

const validators: Record<ProtocolSchema, ValidateFunction> = {
  "workspace-manifest": ajv.compile(workspaceManifestSchema),
  "module-manifest": ajv.compile(moduleManifestSchema),
  "change-set": ajv.compile(changeSetSchema),
  "proposal-record": ajv.compile(proposalRecordSchema),
  "approval-record": ajv.compile(approvalRecordSchema),
  "json-envelope": ajv.compile(jsonEnvelopeSchema)
};

export function validateProtocol(
  schema: ProtocolSchema,
  value: unknown
): ValidationResult {
  const validator = validators[schema];
  const valid = validator(value);

  return {
    valid: Boolean(valid),
    errors: valid ? [] : [...(validator.errors ?? [])]
  };
}
