import { readFileSync } from 'node:fs';

export { COMMENT_STYLES, FEATURE_NAMES, commentStylesFor, scanMarkers, stripFeature, validateMarkers } from './markers.mjs';

const load = (file) => JSON.parse(readFileSync(new URL(`./schemas/${file}`, import.meta.url), 'utf8'));

/** JSON schemas (draft 2020-12). */
export const schemas = {
  featureManifest: load('feature-manifest.schema.json'),
  tempo: load('tempo.schema.json'),
  aiSession: load('ai-session.schema.json'),
};
