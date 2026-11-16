import type { EndpointDefinition, Scenario } from '@rn-tempo/api-contract';

/** Available on every endpoint. An endpoint's own `scenarios` of the same name win. */
export const BUILTIN_SCENARIOS: Readonly<Record<string, Scenario>> = {
  notFound: { status: 404 },
  unauthorized: { status: 401 },
  forbidden: { status: 403 },
  rateLimited: { status: 429 },
  serverError: { status: 500 },
  unavailable: { status: 503 },
  slow: { delayMs: 3000 },
};

/** Header that picks a scenario for one request. It wins over the scenario set with the CLI. */
export const SCENARIO_HEADER = 'x-tempo-scenario';

/** Header that carries the control token to the internal routes. */
export const CONTROL_HEADER = 'x-tempo-token';

/** An endpoint's own scenario, or a built-in one of that name. */
export function findScenario(endpoint: EndpointDefinition, name: string): Scenario | undefined {
  return endpoint.scenarios[name] ?? BUILTIN_SCENARIOS[name];
}

/** The scenario names an endpoint accepts, built-in ones first. */
export function scenarioNames(endpoint: EndpointDefinition): string[] {
  return Object.keys({ ...BUILTIN_SCENARIOS, ...endpoint.scenarios });
}
