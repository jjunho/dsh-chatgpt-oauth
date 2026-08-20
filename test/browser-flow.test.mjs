import assert from 'node:assert/strict'
import { test } from 'node:test'
import { browserLogin, REDIRECT_URI } from '../bin/browser-flow.mjs'

test('browser flow opens after callback listener and prints fallback URL', async () => {
  let launchedUrl
  const output = []
  const credential = { access: 'access', refresh: 'refresh' }
  const result = await browserLogin({
    openBrowser(url) {
      launchedUrl = url
      const callbackUrl = new URL(url)
      callbackUrl.protocol = 'http:'
      callbackUrl.hostname = '127.0.0.1'
      callbackUrl.port = '1455'
      callbackUrl.pathname = '/auth/callback'
      callbackUrl.searchParams.set('code', 'authorization-code')
      void fetch(callbackUrl).then(response => {
        assert.equal(response.status, 200)
      })
    },
    output(line) {
      output.push(line)
    },
    async exchangeAuthorizationCode(code, verifier, redirectUri) {
      assert.equal(code, 'authorization-code')
      assert.ok(verifier)
      assert.equal(redirectUri, REDIRECT_URI)
      return credential
    },
  })

  assert.equal(result, credential)
  assert.ok(launchedUrl?.startsWith('https://auth.openai.com/oauth/authorize?'))
  assert.equal(output[0], 'Open this URL if the browser did not open:')
  assert.equal(output[1], '  ' + launchedUrl)
})
