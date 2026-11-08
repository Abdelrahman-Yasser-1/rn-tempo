import { logger } from '@services/logger/logger';

/** What a failing step does to startup. */
export type StepFailurePolicy =
  /** Log an error and stop with the startup error screen. */
  | 'fatal'
  /** Log an error and stop with the security block screen (fail closed). */
  | 'block-security'
  /** Log a warning and go on with the next step. */
  | 'continue';

/** A unit of startup work; `TBlock` is what a step returns to stop startup (a block reason). */
export type BootstrapStep<TBlock> = {
  id: string;
  /** Ids of the steps that must have run before this one. */
  dependsOn: readonly string[];
  /** Resolves to a block to stop startup, or `undefined` to go on. A throw follows `onError`. */
  run: () => Promise<TBlock | undefined>;
  onError: StepFailurePolicy;
  /** The log line when `run` throws. */
  failureMessage: string;
};

/** How the runner turns the two stopping policies into a block. */
export type FailureHandlers<TBlock> = {
  fatal: () => Promise<TBlock>;
  blockSecurity: () => TBlock;
};

/**
 * Orders steps so every step comes after its dependencies. Among steps that are ready, the one
 * declared first wins, so the order is stable. Throws on a duplicate id, an unknown dependency
 * or a cycle.
 */
export function orderSteps<TBlock>(
  steps: readonly BootstrapStep<TBlock>[],
): BootstrapStep<TBlock>[] {
  const ids = new Set<string>();
  for (const step of steps) {
    if (ids.has(step.id)) {
      throw new Error(`Duplicate bootstrap step "${step.id}"`);
    }
    ids.add(step.id);
  }
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`Bootstrap step "${step.id}" depends on unknown step "${dependency}"`);
      }
    }
  }

  const done = new Set<string>();
  const ordered: BootstrapStep<TBlock>[] = [];
  let pending = [...steps];
  while (pending.length > 0) {
    const next = pending.find((step) => step.dependsOn.every((dependency) => done.has(dependency)));
    if (!next) {
      const stuck = pending.map((step) => step.id).join(', ');
      throw new Error(`Bootstrap steps contain a dependency cycle among: ${stuck}`);
    }
    ordered.push(next);
    done.add(next.id);
    pending = pending.filter((step) => step !== next);
  }
  return ordered;
}

/**
 * Runs the steps one after another in dependency order. Stops at the first block a step returns
 * or at a failing step whose policy is `fatal` or `block-security`; resolves `undefined` when
 * every step ran.
 */
export async function runSteps<TBlock>(
  steps: readonly BootstrapStep<TBlock>[],
  handlers: Readonly<FailureHandlers<TBlock>>,
): Promise<TBlock | undefined> {
  for (const step of orderSteps(steps)) {
    try {
      const block = await step.run();
      if (block !== undefined) {
        return block;
      }
    } catch (error) {
      if (step.onError === 'continue') {
        logger.warn(step.failureMessage, error);
        continue;
      }
      logger.error(step.failureMessage, error);
      return step.onError === 'fatal' ? await handlers.fatal() : handlers.blockSecurity();
    }
  }
  return undefined;
}
