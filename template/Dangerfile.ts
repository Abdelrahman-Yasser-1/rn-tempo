// Danger rules for pull requests. They run only in generated projects, in the `danger` step of
// `.github/workflows/pr.yml` (`yarn danger ci`); this monorepo's own CI does not run Danger.
// Everything is a warning unless noted. Keep this file free of `any`: Danger ships its own types.
import { danger, fail, schedule, warn } from 'danger';

const MAX_CHANGED_LINES = 400;

// Files that inflate a diff without being reviewable code.
const NOISE_PATTERNS: readonly RegExp[] = [
  /(?:^|\/)(?:yarn\.lock|Gemfile\.lock|Podfile\.lock|package-lock\.json)$/,
  /(?:^|\/)ios\/Pods\//,
  /\.png$/,
  /\.pbxproj$/,
  /(?:^|\/)src\/assets\/[^/]+\/index\.ts$/,
];

const isNoise = (file: string): boolean => NOISE_PATTERNS.some((pattern) => pattern.test(file));
const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file) || file.startsWith('e2e/');
const isSource = (file: string): boolean =>
  /^src\/.+\.tsx?$/.test(file) &&
  !isTest(file) &&
  !/\.(?:stories|d)\.tsx?$/.test(file) &&
  !file.startsWith('src/locales/') &&
  !file.startsWith('src/test-utils/');

const countLines = (text: string): number => (text === '' ? 0 : text.split('\n').length);

const changedFiles = [
  ...danger.git.created_files,
  ...danger.git.modified_files,
  ...danger.git.deleted_files,
];
const prTitle = danger.github.pr.title;
const prBody = danger.github.pr.body;
const commitMessages = danger.git.commits.map((commit) => commit.message);

// 1. Large PR: count added + removed lines, ignoring lockfiles, Pods, images, pbxproj and asset indexes.
async function checkPrSize(): Promise<void> {
  const counts = await Promise.all(
    changedFiles
      .filter((file) => !isNoise(file))
      .map(async (file) => {
        const diff = await danger.git.diffForFile(file);
        return diff ? countLines(diff.added) + countLines(diff.removed) : 0;
      }),
  );
  const total = counts.reduce((sum, lines) => sum + lines, 0);
  if (total > MAX_CHANGED_LINES) {
    warn(
      `This PR changes about ${String(total)} lines (limit ${String(MAX_CHANGED_LINES)}; lockfiles, Pods, images, pbxproj and asset indexes excluded). Consider splitting it.`,
    );
  }
}

// 2. Source changed without any test change.
function checkTests(): void {
  if (changedFiles.some(isSource) && !changedFiles.some(isTest)) {
    warn('Source files changed but no test files did. Add or update tests.');
  }
}

// 3. `feat` PRs must link their spec.
function checkSpecLink(): void {
  if (/^feat[(:!]/.test(prTitle) && !prBody.includes('specs/')) {
    warn('`feat` PRs should link their spec under `specs/` in the description.');
  }
}

// 4. Native folders changed: label the PR so reviewers build both platforms.
async function labelNative(): Promise<void> {
  if (!changedFiles.some((file) => /^(?:android|ios)\//.test(file))) return;
  await danger.github.utils.createOrAddLabel({
    name: 'native',
    color: '5319e7',
    description: 'Touches android/ or ios/',
  });
}

// 5. AI-Assisted commit trailers need the PR checkbox ticked (fail).
function checkAiDisclosure(): void {
  const hasAiTrailer = commitMessages.some((text) => /^AI-Assisted:/im.test(text));
  const isAiBoxTicked = /-\s*\[x\]\s*AI-assisted/i.test(prBody);
  if (hasAiTrailer && !isAiBoxTicked) {
    fail(
      'Commits carry `AI-Assisted` trailers but the "AI-assisted" checkbox in the PR description is not ticked.',
    );
  }
}

// 6. Dependency changes belong in their own `deps` commit.
async function checkDepsCommit(): Promise<void> {
  if (!changedFiles.includes('package.json')) return;
  const diff = await danger.git.JSONDiffForFile('package.json');
  const hasDepsChange = ['dependencies', 'devDependencies', 'peerDependencies'].some(
    (key) => key in diff,
  );
  const hasDepsCommit = commitMessages.some((text) => /^[a-z]+\(deps\)!?:/.test(text));
  if (hasDepsChange && !hasDepsCommit) {
    warn(
      '`package.json` dependencies changed but no commit uses the `deps` scope, e.g. `build(deps): bump x`.',
    );
  }
}

checkTests();
checkSpecLink();
checkAiDisclosure();
schedule(checkPrSize());
schedule(labelNative());
schedule(checkDepsCommit());
