type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const HTTP_VERBS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
/** The keywords of a Swagger 2.0 non-body parameter that belong to its schema. */
const PARAMETER_SCHEMA_KEYS = ['type', 'format', 'items', 'enum', 'default', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'multipleOf', 'description'];

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);

/** Points `#/definitions/x`, `#/parameters/x` and `#/responses/x` at where the converted document keeps them. */
function rewriteRefs(value: unknown, bodyParameters: ReadonlySet<string>, formParameters: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteRefs(item, bodyParameters, formParameters));
  if (!isObject(value)) return value;
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string') {
      const parameter = /^#\/parameters\/(.+)$/.exec(child);
      if (child.startsWith('#/definitions/')) out[key] = child.replace('#/definitions/', '#/components/schemas/');
      else if (child.startsWith('#/responses/')) out[key] = child.replace('#/responses/', '#/components/responses/');
      else if (parameter !== null) {
        const name = parameter[1] ?? '';
        out[key] = bodyParameters.has(name) || formParameters.has(name) ? `#/components/requestBodies/${name}` : `#/components/parameters/${name}`;
      } else out[key] = child;
    } else out[key] = rewriteRefs(child, bodyParameters, formParameters);
  }
  return out;
}

/** A Swagger 2.0 schema as an OpenAPI 3.0 one: `type: file` is a binary string, `x-nullable` is `nullable`. */
function schemaOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaOf);
  if (!isObject(value)) return value;
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) {
    // Property maps hold user names: only their values are schemas.
    out[key] = key === 'properties' && isObject(child) ? Object.fromEntries(Object.entries(child).map(([name, entry]) => [name, schemaOf(entry)])) : schemaOf(child);
  }
  if (out.type === 'file') {
    out.type = 'string';
    out.format = 'binary';
  }
  if (out['x-nullable'] === true) out.nullable = true;
  delete out['x-nullable'];
  return out;
}

function nonBodySchema(parameter: Json): Json {
  const schema: Json = {};
  for (const key of PARAMETER_SCHEMA_KEYS) if (parameter[key] !== undefined && key !== 'description') schema[key] = parameter[key];
  return schemaOf(schema) as Json;
}

interface Converted {
  parameters: Json[];
  requestBody?: Json;
}

/**
 * Converts the parameters of one operation. `lookup` finds a parameter behind a `$ref`, because only its
 * `in` says whether it is a body, a form field or a plain parameter.
 */
function convertParameters(list: unknown, consumes: string[], lookup: (ref: string) => Json | undefined): Converted {
  const parameters: Json[] = [];
  let body: Json | undefined;
  const form: Json[] = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (!isObject(entry)) continue;
    const resolved = typeof entry.$ref === 'string' ? lookup(entry.$ref) : entry;
    if (resolved === undefined) continue;
    if (resolved.in === 'body') body = resolved;
    else if (resolved.in === 'formData') form.push(resolved);
    else if (typeof entry.$ref === 'string') parameters.push({ $ref: entry.$ref.replace('#/parameters/', '#/components/parameters/') });
    else parameters.push(convertParameter(entry));
  }
  const requestBody = buildRequestBody(body, form, consumes);
  return { parameters, ...(requestBody === undefined ? {} : { requestBody }) };
}

function convertParameter(parameter: Json): Json {
  return {
    name: parameter.name,
    in: parameter.in,
    ...(parameter.description === undefined ? {} : { description: parameter.description }),
    ...(parameter.required === true || parameter.in === 'path' ? { required: true } : {}),
    schema: nonBodySchema(parameter),
  };
}

function buildRequestBody(body: Json | undefined, form: Json[], consumes: string[]): Json | undefined {
  if (body !== undefined) {
    const types = consumes.filter((type) => !/^(multipart\/form-data|application\/x-www-form-urlencoded)$/.test(type));
    const content: Json = {};
    for (const type of types.length === 0 ? ['application/json'] : types) content[type] = { schema: schemaOf(body.schema ?? {}) };
    return { ...(body.required === true ? { required: true } : {}), ...(body.description === undefined ? {} : { description: body.description }), content };
  }
  if (form.length === 0) return undefined;
  const properties: Json = {};
  const required: string[] = [];
  let hasFile = false;
  for (const field of form) {
    if (typeof field.name !== 'string') continue;
    if (field.type === 'file') hasFile = true;
    properties[field.name] = nonBodySchema(field);
    if (field.required === true) required.push(field.name);
  }
  const type = hasFile || consumes.includes('multipart/form-data') ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
  return { content: { [type]: { schema: { type: 'object', properties, ...(required.length === 0 ? {} : { required }) } } } };
}

function convertResponses(responses: unknown, produces: string[]): Json {
  const out: Json = {};
  if (!isObject(responses)) return out;
  for (const [code, raw] of Object.entries(responses)) {
    if (!isObject(raw) || typeof raw.$ref === 'string') {
      out[code] = raw;
      continue;
    }
    const examples = isObject(raw.examples) ? raw.examples : {};
    const types = produces.length === 0 ? ['application/json'] : produces;
    const content: Json = {};
    if (raw.schema !== undefined || Object.keys(examples).length > 0) {
      for (const type of types) {
        content[type] = { ...(raw.schema === undefined ? {} : { schema: schemaOf(raw.schema) }), ...(examples[type] === undefined ? {} : { example: examples[type] }) };
      }
      // An example for a type `produces` does not list still counts.
      for (const [type, example] of Object.entries(examples)) if (content[type] === undefined) content[type] = { ...(raw.schema === undefined ? {} : { schema: schemaOf(raw.schema) }), example };
    }
    out[code] = { description: typeof raw.description === 'string' ? raw.description : '', ...(Object.keys(content).length === 0 ? {} : { content }) };
  }
  return out;
}

function convertSecurity(definitions: unknown): Json {
  const out: Json = {};
  if (!isObject(definitions)) return out;
  for (const [name, raw] of Object.entries(definitions)) {
    if (!isObject(raw)) continue;
    if (raw.type === 'basic') out[name] = { type: 'http', scheme: 'basic' };
    else if (raw.type === 'apiKey') out[name] = { type: 'apiKey', in: raw.in, name: raw.name };
    else if (raw.type === 'oauth2') out[name] = { type: 'oauth2', flows: {} };
  }
  return out;
}

/**
 * Converts a Swagger 2.0 document into an OpenAPI 3.0 one: `definitions` become `components.schemas`, body and
 * form parameters become `requestBody`, `schema` and `examples` of a response go under the `produces` media types,
 * `securityDefinitions` become `securitySchemes`, and `host`, `schemes` and `basePath` become one server URL.
 */
export function swagger2ToOpenApi3(doc: Json): Json {
  const rootConsumes = strings(doc.consumes);
  const rootProduces = strings(doc.produces);
  const sharedParameters = isObject(doc.parameters) ? doc.parameters : {};
  const lookup = (ref: string): Json | undefined => {
    const found = /^#\/parameters\/(.+)$/.exec(ref);
    const parameter = found === null ? undefined : sharedParameters[found[1] ?? ''];
    return isObject(parameter) ? parameter : undefined;
  };
  const bodyParameters = new Set(Object.entries(sharedParameters).filter(([, p]) => isObject(p) && p.in === 'body').map(([name]) => name));
  const formParameters = new Set(Object.entries(sharedParameters).filter(([, p]) => isObject(p) && p.in === 'formData').map(([name]) => name));

  const paths: Json = {};
  for (const [path, rawItem] of Object.entries(isObject(doc.paths) ? doc.paths : {})) {
    if (!isObject(rawItem)) continue;
    const item: Json = {};
    const itemParameters = convertParameters(rawItem.parameters, rootConsumes, lookup);
    if (itemParameters.parameters.length > 0) item.parameters = itemParameters.parameters;
    for (const [verb, raw] of Object.entries(rawItem)) {
      if (!HTTP_VERBS.includes(verb) || !isObject(raw)) continue;
      const consumes = raw.consumes === undefined ? rootConsumes : strings(raw.consumes);
      const produces = raw.produces === undefined ? rootProduces : strings(raw.produces);
      const converted = convertParameters(raw.parameters, consumes, lookup);
      // A body parameter shared by the whole path item applies to every operation of it.
      const requestBody = converted.requestBody ?? itemParameters.requestBody;
      const { parameters: _drop, consumes: _c, produces: _p, schemes: _s, responses, ...rest } = raw;
      item[verb] = {
        ...rest,
        ...(converted.parameters.length > 0 ? { parameters: converted.parameters } : {}),
        ...(requestBody === undefined ? {} : { requestBody }),
        responses: convertResponses(responses, produces),
      };
    }
    paths[path] = item;
  }

  const requestBodies: Json = {};
  const parameters: Json = {};
  for (const [name, raw] of Object.entries(sharedParameters)) {
    if (!isObject(raw)) continue;
    if (raw.in === 'body') requestBodies[name] = buildRequestBody(raw, [], rootConsumes) ?? {};
    else if (raw.in === 'formData') requestBodies[name] = buildRequestBody(undefined, [raw], rootConsumes) ?? {};
    else parameters[name] = convertParameter(raw);
  }
  const responses: Json = {};
  for (const [name, raw] of Object.entries(isObject(doc.responses) ? doc.responses : {})) {
    responses[name] = convertResponses({ x: raw }, rootProduces).x;
  }

  const host = typeof doc.host === 'string' && doc.host !== '' ? doc.host : undefined;
  const basePath = typeof doc.basePath === 'string' && doc.basePath !== '/' ? doc.basePath : '';
  const schemes = strings(doc.schemes);
  const scheme = schemes.includes('https') ? 'https' : schemes[0];
  const servers = host === undefined ? (basePath === '' ? [] : [{ url: basePath }]) : [{ url: `${scheme ?? 'https'}://${host}${basePath}` }];

  const converted: Json = {
    openapi: '3.0.3',
    info: isObject(doc.info) ? doc.info : { title: 'Imported API', version: '1.0.0' },
    ...(servers.length === 0 ? {} : { servers }),
    paths,
    components: {
      schemas: schemaOf(isObject(doc.definitions) ? doc.definitions : {}),
      parameters,
      requestBodies,
      responses,
      securitySchemes: convertSecurity(doc.securityDefinitions),
    },
    ...(doc.security === undefined ? {} : { security: doc.security }),
    ...(doc.tags === undefined ? {} : { tags: doc.tags }),
  };
  return rewriteRefs(converted, bodyParameters, formParameters) as Json;
}
