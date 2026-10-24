import pkg from '../../package.json' with { type: 'json' };

/** Version of this CLI, injected from package.json at build time. */
export const CLI_VERSION: string = pkg.version;
