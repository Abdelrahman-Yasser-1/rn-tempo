import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// package.json `version` (bumped by release-please) is the one source of the marketing version.
// These checks fail when the native projects would stop resolving to it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const { version } = JSON.parse(read('package.json'));

describe('native version sync', () => {
  it('keeps the release-please manifest on the package.json version', () => {
    assert.equal(JSON.parse(read('.release-please-manifest.json'))['.'], version);
  });

  it('iOS: Version.xcconfig holds the package.json version in an annotated block', () => {
    const text = read('ios/Config/Version.xcconfig');
    const block = /\/\/ x-release-please-start-version\n(.*)\n\/\/ x-release-please-end/.exec(text);
    assert.ok(block, 'Version.xcconfig needs the x-release-please-start-version block');
    assert.equal(block[1], `MARKETING_VERSION = ${version}`);
    assert.equal(text.match(/^MARKETING_VERSION\b/gm)?.length, 1);
  });

  it('iOS: release-please bumps Version.xcconfig', () => {
    const config = JSON.parse(read('release-please-config.json'));
    assert.ok(
      config.packages['.']['extra-files'].some(
        (file) => file.type === 'generic' && file.path === 'ios/Config/Version.xcconfig',
      ),
    );
  });

  it('iOS: every env xcconfig includes Version.xcconfig', () => {
    const shared = readdirSync(path.join(root, 'ios/Config')).filter((file) =>
      file.endsWith('.shared.xcconfig'),
    );
    assert.ok(shared.length > 0);
    for (const file of shared) {
      assert.match(read(`ios/Config/${file}`), /^#include "Version\.xcconfig"$/m, file);
    }
  });

  it('iOS: no target setting overrides MARKETING_VERSION (it would beat the xcconfig)', () => {
    assert.doesNotMatch(read('ios/TempoApp.xcodeproj/project.pbxproj'), /MARKETING_VERSION/);
  });

  it('iOS: Info.plist reads CFBundleShortVersionString from MARKETING_VERSION', () => {
    assert.match(
      read('ios/TempoApp/Info.plist'),
      /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/,
    );
  });

  it('Android: versionName falls back to the package.json version', () => {
    const gradle = read('android/app/build.gradle');
    assert.match(gradle, /JsonSlurper\(\)\.parse\(file\("\.\.\/\.\.\/package\.json"\)\)\.version/);
    assert.match(
      gradle,
      /versionName\(\(project\.findProperty\("tempoVersionName"\) \?: packageVersion\)/,
    );
  });
});
