import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { commentStylesFor, scanMarkers, stripFeature, validateMarkers, type FeatureName } from '@rn-tempo/contracts';

import { CliError } from './errors.ts';
import { isTextFile, walkFiles } from './fs-utils.ts';

const MARKER_PREFIX = '@tempo-feature:';

/** Thrown when a file has unbalanced, nested or unknown markers; `details` lists `file:line` problems. */
export class MarkerError extends CliError {
  constructor(problems: readonly string[]) {
    super(`Invalid feature markers (${problems.length} problem${problems.length === 1 ? '' : 's'})`, {
      code: 'MARKERS_INVALID',
      details: problems,
    });
    this.name = 'MarkerError';
  }
}

/**
 * Validates the markers of one file and returns the problems (`file:line message`). JSON files must
 * not carry markers (use manifest `jsonPatches`), so any marker in them is a problem.
 */
export function markerProblems(text: string, filePath: string): string[] {
  if (!text.includes(MARKER_PREFIX)) return [];
  if (filePath.endsWith('.json')) {
    return scanMarkers(text).map((marker) => `${filePath}:${marker.line} markers are not allowed in JSON (use jsonPatches)`);
  }
  return validateMarkers(text, filePath);
}

/**
 * Removes the regions and single-line markers of the given features from one file's text.
 * Throws `MarkerError` on unbalanced markers. Reuses `@rn-tempo/contracts`; nothing is re-implemented.
 */
export function stripFeaturesFromText(text: string, features: readonly FeatureName[], filePath: string): string {
  const problems = markerProblems(text, filePath);
  if (problems.length > 0) throw new MarkerError(problems);
  let result = text;
  for (const feature of features) result = stripFeature(result, feature, filePath);
  return result;
}

/** True when feature markers of this file type are supported (markdown and unknown types are skipped). */
function supportsMarkers(filePath: string): boolean {
  return commentStylesFor(filePath).length > 0 || filePath.endsWith('.json');
}

export type StripReport = { changed: string[]; checked: number };

/**
 * Strips the given features from every text file in the project. All marker problems across the
 * project are collected first, so one run reports every broken file instead of the first one.
 */
export async function stripFeaturesInProject(root: string, features: readonly FeatureName[]): Promise<StripReport> {
  const files = (await walkFiles(root)).filter(supportsMarkers);
  const pending: { file: string; text: string }[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const absolute = path.join(root, file);
    if (!(await isTextFile(absolute))) continue;
    const text = await readFile(absolute, 'utf8');
    if (!text.includes(MARKER_PREFIX)) continue;
    const fileProblems = markerProblems(text, file);
    problems.push(...fileProblems);
    pending.push({ file, text });
  }
  if (problems.length > 0) throw new MarkerError(problems);

  const changed: string[] = [];
  for (const { file, text } of pending) {
    const next = stripFeaturesFromText(text, features, file);
    if (next !== text) {
      await writeFile(path.join(root, file), next);
      changed.push(file);
    }
  }
  return { changed, checked: pending.length };
}

/** Returns every marker problem in the project (for `doctor` and CI-style checks). */
export async function validateProjectMarkers(root: string): Promise<string[]> {
  const problems: string[] = [];
  for (const file of (await walkFiles(root)).filter(supportsMarkers)) {
    const absolute = path.join(root, file);
    if (!(await isTextFile(absolute))) continue;
    problems.push(...markerProblems(await readFile(absolute, 'utf8'), file));
  }
  return problems;
}
