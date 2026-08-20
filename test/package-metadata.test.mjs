import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import packageJson from '../package.json' with { type: 'json' };

test('publishes standalone package metadata', async () => {
  assert.equal(packageJson.name, 'dsh-chatgpt-oauth');
  assert.equal(packageJson.version, '0.1.0');
  assert.equal(packageJson.private, false);
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.main, './index.js');
  assert.deepEqual(packageJson.exports, {
    '.': './index.js',
    './credentials': './credentials.js',
  });
  assert.deepEqual(packageJson.bin, {
    'dsh-chatgpt-login': 'bin/login.mjs',
  });
  assert.deepEqual(packageJson.engines, { node: '>=22.19.0' });
  assert.equal(packageJson.packageManager, 'pnpm@11.10.0');
  assert.deepEqual(packageJson.peerDependencies, {
    '@deepseek-ai/cordis': '>=4.0.1 <5.0.0',
    '@deepseek-ai/dsh-llm': '>=0.1.0-rc.7 <0.2.0',
    '@deepseek-ai/dsh-llm-pi-ai': '>=0.1.0-rc.7 <0.2.0',
    '@earendil-works/pi-ai': '>=0.82.1 <0.83.0',
  });
  assert.deepEqual(packageJson.files, [
    'index.js',
    'credentials.js',
    'bin/',
    'README.md',
    'LICENSE',
    'cordis.patch.yml',
  ]);

  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(patch, /name: 'dsh-chatgpt-oauth'/);
  assert.doesNotMatch(patch, /@deepseek-ai\/dsh-chatgpt-oauth/);
});
