import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply } from '../index.js'
import { writeCredential } from '../credentials.js'

function createContext() {
  let adapter
  const ctx = {
    llm: {
      registerAdapter(_providers, registered) {
        adapter = registered
        return { dispose() {} }
      },
      registerConfigurableProviders() {},
    },
    get() { return undefined },
  }
  apply(ctx)
  assert.ok(adapter)
  return adapter
}

async function temporaryHome(t) {
  const previous = process.env.DSH_HOME
  const home = await mkdtemp(join(tmpdir(), 'dsh-chatgpt-oauth-auth-'))
  process.env.DSH_HOME = home
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  })
  return home
}

async function consumeStream(adapter) {
  for await (const _chunk of adapter.stream({
    provider: 'openai-codex',
    model: 'gpt-5.5',
    messages: [],
  })) {}
}

test('missing credential fails before network access', async (t) => {
  await temporaryHome(t)
  const adapter = createContext()
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = async () => {
    fetchCalled = true
    throw new Error('network must not be reached')
  }
  t.after(() => { globalThis.fetch = originalFetch })

  await assert.rejects(consumeStream(adapter), error => {
    assert.equal(error.code, 'MISSING_CREDENTIAL')
    return true
  })
  assert.equal(fetchCalled, false)
})

test('valid credential reaches the provider without exposing the token', async (t) => {
  await temporaryHome(t)
  const access = 'synthetic-chatgpt-access-token'
  await writeCredential({ access, refresh: 'synthetic-refresh-token', expires: Date.now() + 60_000 })
  const adapter = createContext()
  const originalFetch = globalThis.fetch
  let observedAuthorization
  globalThis.fetch = async (_url, init) => {
    observedAuthorization = new Headers(init?.headers).get('authorization')
    throw new Error('stubbed provider request')
  }
  t.after(() => { globalThis.fetch = originalFetch })

  await assert.rejects(consumeStream(adapter), error => {
    assert.notEqual(error.code, 'MISSING_CREDENTIAL')
    return true
  })
  assert.equal(observedAuthorization, 'Bearer ' + access)
})
