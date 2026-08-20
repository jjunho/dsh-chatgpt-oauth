import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateCallback, validateDeviceAuthorization, validateDeviceToken } from '../bin/token-response.mjs'
import { validateTokenResponse } from '../bin/token-response.mjs'

test('callback rejects mismatched state and accepts matching state', () => {
  assert.throws(() => validateCallback({ state: 'wrong', code: 'code' }, 'expected'), /state mismatch/)
  assert.equal(validateCallback({ state: 'expected', code: 'code' }, 'expected'), 'code')
})

test('PKCE and device responses require non-empty strings', () => {
  assert.throws(() => validateCallback({ state: 'expected', code: ' ' }, 'expected'), /authorization code/)
  assert.throws(() => validateDeviceAuthorization({ device_auth_id: '', user_code: 'user' }), /required fields/)
  assert.deepEqual(validateDeviceAuthorization({ device_auth_id: 'device', user_code: 'user' }), { device_auth_id: 'device', user_code: 'user' })
  assert.throws(() => validateDeviceToken({ authorization_code: 'auth', code_verifier: ' ' }), /required fields/)
  assert.deepEqual(validateDeviceToken({ authorization_code: 'auth', code_verifier: 'verifier' }), { authorization_code: 'auth', code_verifier: 'verifier' })
  assert.throws(() => validateTokenResponse({ access_token: 'access', refresh_token: '', expires_in: 60 }), /required fields/)
})
