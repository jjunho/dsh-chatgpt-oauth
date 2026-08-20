import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateTokenResponse } from '../bin/token-response.mjs'

function assertInvalid(response) {
  assert.throws(() => validateTokenResponse(response), error => {
    assert.equal(error.message, 'OAuth token response missing required fields')
    return true
  })
}

test('valid token response returns durable credential fields', () => {
  const before = Date.now() + 3_600_000
  const credential = validateTokenResponse({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3_600,
  })
  assert.equal(credential.access, 'access-token')
  assert.equal(credential.refresh, 'refresh-token')
  assert.ok(credential.expires >= before - 10)
  assert.ok(credential.expires <= before + 10)
})

test('non-string or empty token fields are rejected', () => {
  assertInvalid({ access_token: 123, refresh_token: 'refresh-token', expires_in: 60 })
  assertInvalid({ access_token: 'access-token', refresh_token: {}, expires_in: 60 })
  assertInvalid({ access_token: '', refresh_token: 'refresh-token', expires_in: 60 })
  assertInvalid({ access_token: 'access-token', refresh_token: '', expires_in: 60 })
})

test('non-finite and non-positive expiry values are rejected', () => {
  for (const expires_in of [Number.NaN, Number.POSITIVE_INFINITY, 0]) {
    assertInvalid({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in })
  }
})

test('Date.now expiry arithmetic overflow is rejected generically', () => {
  const now = Date.now
  Date.now = () => Number.MAX_VALUE
  try {
    assertInvalid({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: Number.MAX_VALUE })
  } finally {
    Date.now = now
  }
})
