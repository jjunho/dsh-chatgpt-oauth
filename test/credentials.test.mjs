import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { credentialPath, readCredential, writeCredential } from '../credentials.js'

async function temporaryHome(t) {
  const previous = process.env.DSH_HOME
  const home = await mkdtemp(join(tmpdir(), 'dsh-chatgpt-oauth-'))
  process.env.DSH_HOME = home
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  })
  return home
}

test('missing credential returns undefined', async (t) => {
  await temporaryHome(t)
  assert.equal(await readCredential(), undefined)
})

test('write/read round trip preserves fields and mode 0600', async (t) => {
  await temporaryHome(t)
  const credential = { access: 'access-token', refresh: 'refresh-token', expires: Date.now() + 60_000, accountId: 'account' }
  await writeCredential(credential)
  assert.deepEqual(await readCredential(), credential)
  assert.equal((await stat(credentialPath())).mode & 0o777, 0o600)
})

test('malformed JSON is rejected without returning token-like content', async (t) => {
  await temporaryHome(t)
  await writeFile(credentialPath(), '{"access":"secret-token",', 'utf8')
  await assert.rejects(readCredential(), error => {
    assert.match(error.message, /credential document/i)
    assert.doesNotMatch(error.message, /secret-token/)
    return true
  })
})

test('credential missing access, refresh, or finite expiry is rejected', async (t) => {
  await temporaryHome(t)
  for (const credential of [
    { refresh: 'refresh', expires: Date.now() + 1 },
    { access: 'access', expires: Date.now() + 1 },
    { access: 'access', refresh: 'refresh', expires: Number.NaN },
    { access: 'access', refresh: 'refresh', expires: 0 },
  ]) {
    await writeFile(credentialPath(), JSON.stringify(credential), 'utf8')
    await assert.rejects(readCredential(), error => {
      assert.match(error.message, /credential document/i)
      assert.doesNotMatch(error.message, /access|refresh|NaN/)
      return true
    })
  }
})
