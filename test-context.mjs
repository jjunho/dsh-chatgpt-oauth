import assert from 'node:assert/strict'
import { apply } from './index.js'

const registrations = []
const ctx = {
  llm: {
    registerAdapter(routes, adapter) { registrations.push({ routes, adapter }); return { replace() {} } },
    registerConfigurableProviders() {},
  },
  get() { return undefined },
}
apply(ctx)
const adapter = registrations[0]?.adapter
assert.ok(adapter)
const model = (await adapter.listModels('openai-codex')).find(model => model.id === 'gpt-5.6-luna')
assert.ok(model)
const resolved = await adapter.resolveModel('openai-codex', model.id)
assert.equal(resolved.context.contextWindow, 1_050_000)
console.log('context metadata regression test passed')
