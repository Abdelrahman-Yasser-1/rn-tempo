import { JSON_LIMITS } from '@features/dynamic-forms/utils/jsonSchema';

type Item = { value: unknown; depth: number };

/** What is wrong with one container (object or array), or `undefined`. */
function containerProblem(value: object, depth: number): string | undefined {
  if (depth >= JSON_LIMITS.depth) {
    return 'the document is nested too deeply';
  }
  if (Array.isArray(value)) {
    return value.length > JSON_LIMITS.arrayLength
      ? 'the document has an array that is too long'
      : undefined;
  }
  const keys = Object.keys(value);
  if (keys.length > JSON_LIMITS.arrayLength) {
    return 'the document has an object with too many keys';
  }
  return keys.some((key) => key.length > JSON_LIMITS.stringLength)
    ? 'the document has a key that is too long'
    : undefined;
}

/** What is wrong with a value that is not a container, or `undefined`. */
function leafProblem(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.length > JSON_LIMITS.stringLength
      ? 'the document has a string that is too long'
      : undefined;
  }
  const isPlain = value === null || ['number', 'boolean', 'undefined'].includes(typeof value);
  return isPlain ? undefined : 'the document is not plain JSON';
}

/**
 * Bounded, iterative walk of the raw input (an explicit stack, no recursion), run before the
 * schema. Refuses a document that is too deep, has too many values, an array, object or string
 * that is too long, or holds something that is not plain JSON (a function, a symbol, a bigint).
 * The message never contains a value from the document. Returns `undefined` within the limits.
 */
export function preCheckJson(input: unknown): string | undefined {
  const stack: Item[] = [{ value: input, depth: 0 }];
  let nodes = 0;
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    nodes += 1;
    if (nodes > JSON_LIMITS.nodes) {
      return 'the document has too many values';
    }
    const { value, depth } = item;
    if (typeof value !== 'object' || value === null) {
      const problem = leafProblem(value);
      if (problem !== undefined) {
        return problem;
      }
    } else {
      const problem = containerProblem(value, depth);
      if (problem !== undefined) {
        return problem;
      }
      for (const child of Object.values(value) as unknown[]) {
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }
  return undefined;
}
