import { z } from 'zod';

/** A JSON Schema object (draft 2020-12, the subset `z.fromJSONSchema` reads). Kept as plain data. */
export const JsonSchemaObject = z.record(z.string(), z.unknown()).meta({ description: 'A JSON Schema (draft 2020-12).' });

const Scenario = z
  .strictObject({
    status: z.number().int().min(100).max(599).optional(),
    delayMs: z.number().int().min(0).optional().meta({ description: 'Wait this long before answering.' }),
    body: z.unknown().optional().meta({ description: 'Sent as the JSON body instead of the normal response.' }),
  })
  .meta({ description: 'A canned response, like a scenario in a code config.' });

const Endpoint = z.strictObject({
  id: z.string().min(1).meta({ description: 'Stable id, for example `get.products.:id`. Scenarios and fixtures use it.' }),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z
    .string()
    .regex(/^\//, 'A path starts with "/".')
    .meta({ description: 'Express-style path with `:param` segments, for example `/products/:id`.' }),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  auth: z.literal('bearer').optional(),
  request: z
    .strictObject({
      params: JsonSchemaObject.optional(),
      query: JsonSchemaObject.optional(),
      body: JsonSchemaObject.optional(),
    })
    .optional(),
  response: z.strictObject({
    status: z.number().int().min(100).max(599),
    schema: JsonSchemaObject.optional(),
    example: z.unknown().optional().meta({ description: 'Served as the response body. Without it, data is generated from `schema`.' }),
  }),
  scenarios: z.record(z.string(), Scenario).optional(),
});

/** The `tempo-api.json` workspace: a mock API stored as data, with no code. */
export const WorkspaceSchema = z
  .strictObject({
    $schema: z.string().optional(),
    name: z.string().min(1),
    basePath: z.string().optional().meta({ description: 'Mounted in front of every path, for example `/api/v1`.' }),
    port: z.number().int().min(0).max(65_535).optional(),
    seed: z.number().int().optional().meta({ description: 'Seed of the data generator.' }),
    endpoints: z.array(Endpoint),
  })
  .meta({ title: 'tempo-api workspace', description: 'A RN-TEMPO dev API described as JSON.' });

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspaceEndpoint = Workspace['endpoints'][number];
export type JsonSchema = Record<string, unknown>;

/** The JSON Schema of `tempo-api.json`, as written to `schemas/tempo-api.schema.json`. */
export function workspaceJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(WorkspaceSchema, { io: 'input' });
}

/** Parses a workspace, with every problem named by its path. */
export function parseWorkspace(value: unknown, file: string): Workspace {
  const result = WorkspaceSchema.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  throw new Error(`${file} is not a valid tempo-api workspace:\n${issues.join('\n')}`);
}
