#!/usr/bin/env node
// Standalone ChatGPT (Codex) OAuth login for DeepSeek Harness.
//
// Runs the OpenAI Codex PKCE flow against auth.openai.com, captures the
// callback on a local server, exchanges the code for access + refresh
// tokens, and writes them to the plugin's credential file. Zero runtime
// dependencies: only node built-ins, so it runs anywhere without the harness.
//
// Usage:
//   dsh-chatgpt-login            # browser login (default)
//   dsh-chatgpt-login --device   # device-code login (headless)
//   dsh-chatgpt-login --logout   # remove the stored credential
import { browserLogin } from './browser-flow.mjs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { chmod, mkdir, rename, writeFile } from 'node:fs/promises'
import { validateTokenResponse, validateDeviceAuthorization, validateDeviceToken } from './token-response.mjs'

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTH_BASE_URL = 'https://auth.openai.com'
const TOKEN_URL = AUTH_BASE_URL + '/oauth/token'
const DEVICE_USER_CODE_URL = AUTH_BASE_URL + '/api/accounts/deviceauth/usercode'
const DEVICE_TOKEN_URL = AUTH_BASE_URL + '/api/accounts/deviceauth/token'
const DEVICE_VERIFICATION_URI = AUTH_BASE_URL + '/codex/device'
const DEVICE_REDIRECT_URI = AUTH_BASE_URL + '/deviceauth/callback'
const JWT_CLAIM_PATH = 'https://api.openai.com/auth'

function credentialPath() {
  const home = (process.env.DSH_HOME ?? '').trim() || join(homedir(), '.dsh')
  return join(home, 'chatgpt-oauth.json')
}

function decodeJwt(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function accountIdFromToken(accessToken) {
  const payload = decodeJwt(accessToken)
  const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id
  return typeof accountId === 'string' && accountId.length > 0 ? accountId : null
}

async function readTokenResponse(response, operation) {
  if (!response.ok) {
    await response.text().catch(() => '')
    throw new Error('OpenAI Codex token ' + operation + ' failed (' + response.status + ')')
  }
  const json = await response.json()
  let credential
  try {
    credential = validateTokenResponse(json)
  } catch {
    throw new Error('OpenAI Codex token ' + operation + ' response missing required fields')
  }
  return {
    ...credential,
    accountId: accountIdFromToken(credential.access),
  }
}

async function exchangeAuthorizationCode(code, verifier, redirectUri) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  })
  return readTokenResponse(response, 'exchange')
}

async function writeCredential(credential) {
  const path = credentialPath()
  const parent = dirname(path)
  await mkdir(parent, { recursive: true, mode: 0o700 })
  await chmod(parent, 0o700)
  const tmp = path + '.tmp'
  await writeFile(tmp, JSON.stringify(credential, null, 2) + '\n', { mode: 0o600 })
  await chmod(tmp, 0o600)
  await rename(tmp, path)
  await chmod(path, 0o600)
}

// ---- device-code flow ----
async function deviceLogin() {
  const startResponse = await fetch(DEVICE_USER_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  })
  if (!startResponse.ok) {
    await startResponse.text().catch(() => '')
    throw new Error('device code request failed (' + startResponse.status + ')')
  }
  const json = await startResponse.json()
  validateDeviceAuthorization(json)
  const requestedInterval = Number(json.interval)
  const intervalSeconds = Number.isFinite(requestedInterval) && requestedInterval > 0
    ? Math.min(requestedInterval, 60)
    : 5
  console.log('Open ' + DEVICE_VERIFICATION_URI + ' and enter the code:')
  console.log('  ' + json.user_code)
  console.log('(waiting for you to authorize...)')
  console.log()

  const deadline = Date.now() + 15 * 60 * 1000
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('device authorization timed out; try again')
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalSeconds * 1000, remaining)))
    if (Date.now() >= deadline) throw new Error('device authorization timed out; try again')
    const tokenResponse = await fetch(DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_auth_id: json.device_auth_id, user_code: json.user_code }),
    })
    if (tokenResponse.ok) {
      const tokenJson = await tokenResponse.json()
      const deviceToken = validateDeviceToken(tokenJson)
      return exchangeAuthorizationCode(deviceToken.authorization_code, deviceToken.code_verifier, DEVICE_REDIRECT_URI)
    }
    if (tokenResponse.status === 403 || tokenResponse.status === 404) continue
    const body = await tokenResponse.text().catch(() => '')
    let errorCode
    try { errorCode = JSON.parse(body)?.error?.code } catch {}
    if (typeof errorCode === 'string') errorCode = errorCode.slice(0, 64).replace(/[^a-zA-Z0-9_.-]/g, '')
    if (errorCode === 'deviceauth_authorization_pending') continue
    if (errorCode === 'slow_down') continue
    throw new Error('device auth failed (' + tokenResponse.status + (errorCode ? ', ' + errorCode : '') + ')')
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--logout')) {
    const { unlink } = await import('node:fs/promises')
    await unlink(credentialPath()).catch((error) => {
      if (error?.code !== 'ENOENT') throw error
    })
    console.log('ChatGPT session removed.')
    return
  }
  try {
    const credential = args.includes('--device') ? await deviceLogin() : await browserLogin({ exchangeAuthorizationCode })
    await writeCredential(credential)
    console.log('Signed in to ChatGPT (Codex). Account: ' + (credential.accountId ?? 'unknown'))
    console.log('Token expires: ' + new Date(credential.expires).toISOString())
  } catch (error) {
    console.error('Login failed: ' + (error?.message ?? String(error)))
    process.exitCode = 1
  }
}

await main()
