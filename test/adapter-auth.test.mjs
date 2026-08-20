import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply } from '../index.js'
import { readCredential, writeCredential } from '../credentials.js'

function createContext() {
  let adapter
  const logs = []
  const logger = Object.fromEntries(['debug', 'info', 'log', 'warn', 'error'].map(level => [
    level,
    (...values) => logs.push(values.map(String).join(' ')),
  ]))
  const ctx = {
    llm: {
      registerAdapter(_providers, registered) {
        adapter = registered
        return { dispose() {} }
      },
      registerConfigurableProviders() {},
    },
    logger,
    get() { return undefined },
  }
  apply(ctx)
  assert.ok(adapter)
  return { adapter, logs }
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
  const chunks = []
  try {
    for await (const chunk of adapter.stream({
      provider: 'openai-codex',
      model: 'gpt-5.5',
      messages: [],
    })) chunks.push(chunk)
  } catch (error) {
    return { chunks, error }
  }
  return { chunks, error: undefined }
}

test('missing credential fails before network access', async (t) => {
  await temporaryHome(t)
  const { adapter } = createContext()
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = async () => {
    fetchCalled = true
    throw new Error('network must not be reached')
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const result = await consumeStream(adapter)
  const terminal = result.chunks.at(-1)
  if (terminal === undefined) assert.equal(result.error?.failure.code, 'MISSING_CREDENTIAL')
  else {
    assert.equal(terminal.type, 'finish')
    assert.equal(terminal.reason.kind, 'error')
    assert.equal(terminal.reason.failure.code, 'MISSING_CREDENTIAL')
  }
  assert.equal(fetchCalled, false)
})

test('valid credential reaches the provider without exposing the token', async (t) => {
  await temporaryHome(t)
  const access = [
    'synthetic-header',
    Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })).toString('base64url'),
    'synthetic-signature',
  ].join('.')
  await writeCredential({ access, refresh: 'synthetic-refresh-token', expires: Date.now() + 60_000 })
  const { adapter, logs } = createContext()
  const stdout = []
  const stderr = []
  const originalStdoutWrite = process.stdout.write
  const originalStderrWrite = process.stderr.write
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true }
  process.stderr.write = (chunk) => { stderr.push(String(chunk)); return true }
  const originalFetch = globalThis.fetch
  let observedAuthorization
  globalThis.fetch = async (_url, init) => {
    observedAuthorization = new Headers(init?.headers).get('authorization')
    throw new Error('stubbed provider request')
  }
  t.after(() => {
    globalThis.fetch = originalFetch
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite
  })

  const result = await consumeStream(adapter)
  const terminal = result.chunks.at(-1)
  if (terminal !== undefined) {
    assert.equal(terminal.type, 'finish')
    assert.equal(terminal.reason.kind, 'error')
    assert.notEqual(terminal.reason.failure.code, 'MISSING_CREDENTIAL')
  } else assert.notEqual(result.error?.code, 'MISSING_CREDENTIAL')
  assert.equal(observedAuthorization, 'Bearer ' + access)
  assert.equal(logs.some(value => value.includes(access)), false)
  assert.equal(stdout.join('').includes(access), false)
  assert.equal(stderr.join('').includes(access), false)
})

test('expired credential refreshes, rotates persisted token, and maps failures to AUTH', async (t) => {
  await temporaryHome(t)
  await writeCredential({ access: 'expired-access', refresh: 'old-refresh', expires: Date.now() - 1 })
  const { adapter } = createContext()
  const originalFetch = globalThis.fetch
  let refreshCalls = 0
  const rotatedAccess = 'header.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'rotated-account' } })).toString('base64url') + '.signature'
  globalThis.fetch = async (url) => {
    if (String(url).includes('auth.openai.com')) {
      refreshCalls++
      return new Response(JSON.stringify({ access_token: rotatedAccess, refresh_token: 'rotated-refresh', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    throw new Error('provider request stopped')
  }
  t.after(() => { globalThis.fetch = originalFetch })
  await consumeStream(adapter)
  assert.equal(refreshCalls, 1)
  const rotated = await readCredential()
  assert.equal(rotated.access, rotatedAccess)
  assert.equal(rotated.refresh, 'rotated-refresh')

  for (const response of [
    new Response('{malformed', { status: 200 }),
    new Response('', { status: 500 }),
  ]) {
    await writeCredential({ access: 'expired-access', refresh: 'old-refresh', expires: Date.now() - 1 })
    globalThis.fetch = async () => response
    const result = await consumeStream(adapter)
    const terminal = result.chunks.at(-1)
    const failure = terminal?.reason?.failure ?? result.error?.failure
    assert.equal(failure.code, 'AUTH')
  }
})
