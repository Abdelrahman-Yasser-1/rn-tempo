import { logger } from '@services/logger/logger';

import { orderSteps, runSteps, type BootstrapStep, type StepFailurePolicy } from './stepGraph';

type Block = { reason: string };

function step(
  id: string,
  dependsOn: string[] = [],
  overrides: Partial<BootstrapStep<Block>> = {},
): BootstrapStep<Block> {
  return {
    id,
    dependsOn,
    onError: 'fatal',
    failureMessage: `${id} failed`,
    run: () => Promise.resolve(undefined),
    ...overrides,
  };
}

const ids = (steps: readonly BootstrapStep<Block>[]) => steps.map((entry) => entry.id);

describe('orderSteps', () => {
  test('keeps the declaration order when nothing forces another one', () => {
    expect(ids(orderSteps([step('a'), step('b'), step('c')]))).toEqual(['a', 'b', 'c']);
  });

  test('puts a step after its dependencies, even when declared before them', () => {
    const ordered = orderSteps([step('c', ['b']), step('b', ['a']), step('a')]);

    expect(ids(ordered)).toEqual(['a', 'b', 'c']);
  });

  test('breaks ties by declaration order', () => {
    const ordered = orderSteps([step('root'), step('x', ['root']), step('y', ['root'])]);

    expect(ids(ordered)).toEqual(['root', 'x', 'y']);
  });

  test('throws on a dependency cycle and names the steps involved', () => {
    expect(() => orderSteps([step('a', ['b']), step('b', ['a']), step('c')])).toThrow(
      /cycle among: a, b/,
    );
  });

  test('throws when a step depends on itself', () => {
    expect(() => orderSteps([step('a', ['a'])])).toThrow(/cycle/);
  });

  test('throws on an unknown dependency', () => {
    expect(() => orderSteps([step('a', ['missing'])])).toThrow(
      'Bootstrap step "a" depends on unknown step "missing"',
    );
  });

  test('throws on a duplicate id', () => {
    expect(() => orderSteps([step('a'), step('a')])).toThrow('Duplicate bootstrap step "a"');
  });
});

describe('runSteps', () => {
  const handlers = {
    fatal: jest.fn(() => Promise.resolve({ reason: 'startupError' })),
    blockSecurity: jest.fn(() => ({ reason: 'security' })),
  };

  beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
    jest.spyOn(logger, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  function tracked(calls: string[], id: string, dependsOn: string[], onError: StepFailurePolicy) {
    return step(id, dependsOn, {
      onError,
      run: () => {
        calls.push(id);
        return Promise.resolve(undefined);
      },
    });
  }

  test('runs every step in dependency order and resolves undefined', async () => {
    const calls: string[] = [];

    const result = await runSteps(
      [tracked(calls, 'b', ['a'], 'fatal'), tracked(calls, 'a', [], 'fatal')],
      handlers,
    );

    expect(result).toBeUndefined();
    expect(calls).toEqual(['a', 'b']);
  });

  test('stops at the first block a step returns', async () => {
    const calls: string[] = [];
    const blocking = step('gate', [], {
      run: () => {
        calls.push('gate');
        return Promise.resolve({ reason: 'maintenance' });
      },
    });

    const result = await runSteps(
      [tracked(calls, 'a', [], 'fatal'), blocking, tracked(calls, 'after', ['gate'], 'fatal')],
      handlers,
    );

    expect(result).toEqual({ reason: 'maintenance' });
    expect(calls).toEqual(['a', 'gate']);
  });

  test('fatal: logs an error, stops and returns the fatal block', async () => {
    const calls: string[] = [];
    const failing = step('boom', [], { run: () => Promise.reject(new Error('x')) });

    const result = await runSteps([failing, tracked(calls, 'later', ['boom'], 'fatal')], handlers);

    expect(result).toEqual({ reason: 'startupError' });
    expect(calls).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith('boom failed', expect.any(Error));
    expect(handlers.fatal).toHaveBeenCalledTimes(1);
  });

  test('block-security: logs an error, stops and returns the security block', async () => {
    const calls: string[] = [];
    const failing = step('guard', [], {
      onError: 'block-security',
      run: () => Promise.reject(new Error('native')),
    });

    const result = await runSteps([failing, tracked(calls, 'later', ['guard'], 'fatal')], handlers);

    expect(result).toEqual({ reason: 'security' });
    expect(calls).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith('guard failed', expect.any(Error));
    expect(handlers.fatal).not.toHaveBeenCalled();
  });

  test('continue: logs a warning and runs the next step', async () => {
    const calls: string[] = [];
    const failing = step('optional', [], {
      onError: 'continue',
      run: () => Promise.reject(new Error('meh')),
    });

    const result = await runSteps(
      [failing, tracked(calls, 'next', ['optional'], 'fatal')],
      handlers,
    );

    expect(result).toBeUndefined();
    expect(calls).toEqual(['next']);
    expect(logger.warn).toHaveBeenCalledWith('optional failed', expect.any(Error));
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('a synchronous throw in run follows the same policy', async () => {
    const failing = step('sync', [], {
      run: () => {
        throw new Error('sync');
      },
    });

    await expect(runSteps([failing], handlers)).resolves.toEqual({ reason: 'startupError' });
  });

  test('a cycle or an unknown dependency throws before any step runs', async () => {
    const calls: string[] = [];

    await expect(
      runSteps(
        [tracked(calls, 'a', ['b'], 'fatal'), tracked(calls, 'b', ['a'], 'fatal')],
        handlers,
      ),
    ).rejects.toThrow(/cycle/);
    await expect(runSteps([tracked(calls, 'a', ['nope'], 'fatal')], handlers)).rejects.toThrow(
      /unknown step/,
    );
    expect(calls).toEqual([]);
  });
});
