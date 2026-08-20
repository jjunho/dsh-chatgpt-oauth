import assert from 'node:assert/strict'
import { mkdtemp, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { test } from 'node:test'

function checkCli() {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--check', 'bin/login.mjs'], (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

test('CLI parses and logout leaves no credential file', async () => {
  await checkCli()
  const home = await mkdtemp(join(tmpdir(), 'dsh-chatgpt-oauth-cli-'))
  const result = await run(['bin/login.mjs', '--logout'], { ...process.env, DSH_HOME: home })
  assert.equal(result.code, 0)
  await assert.rejects(access(join(home, 'chatgpt-oauth.json')))
})
