export type FeatureName =
  | 'ssl-pinning'
  | 'device-integrity'
  | 'storybook'
  | 'dynamic-forms'
  | 'samples'
  | 'maestro'
  | 'ci-github'
  | 'ai-claude'
  | 'ai-cursor'
  | 'ai-copilot';

export declare const FEATURE_NAMES: readonly FeatureName[];

export type CommentStyleName = 'slash' | 'jsx' | 'xml' | 'hash';
export interface CommentStyle {
  start: (name: string) => string;
  end: (name: string) => string;
  single: ((name: string) => string) | null;
}
export declare const COMMENT_STYLES: Readonly<Record<CommentStyleName, CommentStyle>>;
export declare function commentStylesFor(filePath: string): CommentStyleName[];

export interface FoundMarker {
  name: string;
  kind: 'start' | 'end' | 'single';
  line: number;
}
export declare function scanMarkers(text: string): FoundMarker[];
export declare function validateMarkers(text: string, filePath?: string): string[];
export declare function stripFeature(text: string, name: FeatureName, filePath?: string): string;

/** `.tempo/features/<name>.json` (contract C7.4). */
export interface FeatureManifest {
  $schema?: string;
  name: FeatureName;
  title: string;
  description: string;
  defaultEnabled: boolean;
  requires: FeatureName[];
  conflicts: FeatureName[];
  deleteGlobs: string[];
  dependencies: string[];
  devDependencies: string[];
  envKeys: string[];
  jsonPatches: { file: string; op: 'remove'; path: string }[];
  postRemove: ('pods' | 'assets-sync')[];
  docs: string;
}

export interface TempoEnv {
  name: string;
  suffix: string;
  displayName: string;
  scheme: string;
  badge: string | null;
}

/** `.tempo.json` (contract C8). */
export interface TempoJson {
  $schema?: string;
  templateVersion: string;
  createdWith: string;
  app: { name: string; displayName: string; bundleId: string };
  envs: TempoEnv[];
  features: FeatureName[];
  ai: { tools: ('claude' | 'cursor' | 'copilot')[]; logPrompts: 'full' | 'summary' | 'off' };
}

/** Frontmatter of `.ai/sessions/<file>.md` (contract C9). */
export interface AiSessionMeta {
  id: string;
  tool: string;
  model: string;
  author: string;
  branch: string | null;
  spec: string | null;
  started: string;
  ended: string | null;
  commits: string[];
  files: string[];
}

export declare const schemas: {
  featureManifest: Record<string, unknown>;
  tempo: Record<string, unknown>;
  aiSession: Record<string, unknown>;
};
