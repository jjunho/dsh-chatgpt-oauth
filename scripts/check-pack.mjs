#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const storeDir = resolve(projectRoot, '.pnpm-store');
const result = spawnSync('pnpm', ['pack', '--dry-run', '--json'], {
  cwd: projectRoot, encoding: 'utf8',
  env: { ...process.env, PNPM_CONFIG_STORE_DIR: process.env.PNPM_CONFIG_STORE_DIR ?? storeDir },
});

if (result.error) throw result.error;
if (result.status !== 0) { process.stderr.write(result.stderr || 'pnpm pack failed\n'); process.exit(result.status ?? 1); }

let report;
try { report = JSON.parse(result.stdout); } catch (error) { console.error('pnpm pack --dry-run --json did not return valid JSON:', error.message); process.exit(1); }

const files = Array.isArray(report.files) ? report.files.map((entry) => entry?.path) : [];
const required = new Set(['index.js', 'credentials.js', 'bin/login.mjs', 'bin/browser-flow.mjs', 'bin/token-response.mjs', 'README.md', 'LICENSE', 'package.json', 'cordis.patch.yml']);
const actual = new Set(files);
const missing = [...required].filter((path) => !actual.has(path));
const unexpected = files.filter((path) => typeof path !== 'string' || !required.has(path));
const forbidden = files.filter((path) => typeof path === 'string' && /(?:^|\/)(?:test|tests|\.git)(?:\/|$)|(?:^|\/)(?:\.env(?:\.|$)|.*(?:credential|report|coverage|lock|tsconfig|eslint|prettier|vitest|pnpmfile|npmrc).*)/i.test(path) && path !== 'credentials.js');
const duplicates = files.filter((path, index) => files.indexOf(path) !== index);

if (missing.length || unexpected.length || forbidden.length || duplicates.length || files.length !== required.size) {
  console.error(JSON.stringify({ missing, unexpected, forbidden, duplicates, fileCount: files.length }, null, 2));
  process.exit(1);
}
console.log(`Package contents valid (${files.length} files).`);
