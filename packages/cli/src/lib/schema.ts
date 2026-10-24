import { schemas } from '@rn-tempo/contracts';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

type Validators = { tempo: ValidateFunction; manifest: ValidateFunction };

let cached: Validators | undefined;

/** Compiles the contract schemas once (JSON Schema 2020-12, strict). */
export function validators(): Validators {
  if (cached) return cached;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(schemas.featureManifest, 'feature-manifest.schema.json');
  const manifest = ajv.getSchema('feature-manifest.schema.json');
  if (!manifest) throw new Error('feature-manifest schema failed to compile');
  cached = { tempo: ajv.compile(schemas.tempo), manifest };
  return cached;
}

/** Formats ajv errors as `path message` lines. */
export function formatSchemaErrors(validate: ValidateFunction): string[] {
  return (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`);
}
