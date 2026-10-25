import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pathExists, walkFiles } from '../src/lib/fs-utils.ts';
import { isValidAppName, isValidBundleId, kebabCase, renameProject, type AppIdentity } from '../src/lib/rename.ts';
import { copyTemplate, makeTempDir } from './helpers.ts';

const FROM: AppIdentity = {
  name: 'TempoApp',
  displayName: 'Tempo',
  bundleId: 'com.rntempo.app',
  envs: {
    dev: { displayName: 'Tempo Dev', scheme: 'tempo-dev' },
    staging: { displayName: 'Tempo Stg', scheme: 'tempo-staging' },
    prod: { displayName: 'Tempo', scheme: 'tempo' },
  },
};

const TO: AppIdentity = {
  name: 'AcmeShop',
  displayName: 'Acme Shop',
  bundleId: 'io.acme.shop',
  envs: {
    dev: { displayName: 'Acme Shop Dev', scheme: 'acme-shop-dev' },
    staging: { displayName: 'Acme Shop Stg', scheme: 'acme-shop-staging' },
    prod: { displayName: 'Acme Shop', scheme: 'acme-shop' },
  },
};

describe('validation helpers', () => {
  it('validates names and bundle ids', () => {
    expect(isValidAppName('MyApp')).toBe(true);
    expect(isValidAppName('my-app')).toBe(false);
    expect(isValidBundleId('com.acme.app')).toBe(true);
    expect(isValidBundleId('acme')).toBe(false);
    expect(kebabCase('AcmeShop')).toBe('acme-shop');
  });
});

describe('renameProject on the real template', () => {
  let dir = '';
  let cleanup = async () => {};
  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-rename'));
    await copyTemplate(dir);
    await renameProject(dir, FROM, TO);
  });
  afterEach(async () => cleanup());
  const read = (rel: string) => readFile(path.join(dir, rel), 'utf8');

  it('leaves no old identifier in Android, iOS or JS files', async () => {
    const offenders: string[] = [];
    for (const file of await walkFiles(dir)) {
      if (file === '.tempo.json' || file.endsWith('.png')) continue;
      const text = await readFile(path.join(dir, file), 'utf8').catch(() => '');
      if (/TempoApp|com\.rntempo\.app|com\/rntempo\/app/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('moves Android sources and iOS folders, files and schemes', async () => {
    expect(await pathExists(path.join(dir, 'android/app/src/main/java/io/acme/shop/MainActivity.kt'))).toBe(true);
    expect(await pathExists(path.join(dir, 'android/app/src/main/java/com'))).toBe(false);
    expect(await pathExists(path.join(dir, 'ios/AcmeShop/AppDelegate.swift'))).toBe(true);
    expect(await pathExists(path.join(dir, 'ios/AcmeShop.xcodeproj/xcshareddata/xcschemes/AcmeShop-Dev.xcscheme'))).toBe(true);
    expect(await pathExists(path.join(dir, 'ios/AcmeShop/AcmeShop.entitlements'))).toBe(true);
    expect(await pathExists(path.join(dir, 'ios/TempoApp'))).toBe(false);
  });

  it('rewrites gradle, xcconfig, env, app.json and package.json', async () => {
    const gradle = await read('android/app/build.gradle');
    expect(gradle).toContain('namespace "io.acme.shop"');
    expect(gradle).toContain('applicationIdSuffix ".dev"');
    expect(gradle).toContain('resValue "string", "app_name", "Acme Shop Stg"');
    expect(gradle).toContain('deepLinkScheme: "acme-shop-dev"');
    expect(gradle).toContain('deepLinkScheme: "acme-shop",');
    expect(gradle).toContain('tempoAllowDebugSigning');
    expect(await read('ios/Config/Dev.shared.xcconfig')).toContain('PRODUCT_BUNDLE_IDENTIFIER = io.acme.shop.dev');
    expect(await read('ios/Config/Prod.shared.xcconfig')).toContain('APP_URL_SCHEME = acme-shop');
    expect(await read('.env.dev')).toContain('DEEP_LINK_SCHEME=acme-shop-dev');
    expect(JSON.parse(await read('app.json'))).toEqual({ name: 'AcmeShop', displayName: 'Acme Shop' });
    expect(JSON.parse(await read('package.json')).name).toBe('acme-shop');
    expect(await read('package.json')).toContain('--project ios/AcmeShop.xcodeproj --target AcmeShop');
  });

  it('keeps the contract package scope untouched', async () => {
    expect(await read('package.json')).toContain('@rn-tempo/');
  });
});
