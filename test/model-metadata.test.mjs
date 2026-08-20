import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply } from '../index.js'

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

test('preserves provider-specific context metadata', async () => {
  const adapter = createContext()
  for (const model of ['gpt-5.5', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra']) {
    const resolved = await adapter.resolveModel('openai-codex', model)
    assert.equal(resolved.context.contextWindow, 1_050_000, model)
  }
  const legacy = await adapter.resolveModel('openai-codex', 'gpt-5.4')
  assert.equal(legacy.context.contextWindow, 272_000)
})
