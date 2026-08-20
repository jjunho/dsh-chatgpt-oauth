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
import { randomBytes, createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { chmod, mkdir, rename, writeFile } from 'node:fs/promises'
import { validateTokenResponse, validateCallback, validateDeviceAuthorization, validateDeviceToken } from './token-response.mjs'

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTH_BASE_URL = 'https://auth.openai.com'
const AUTHORIZE_URL = AUTH_BASE_URL + '/oauth/authorize'
const TOKEN_URL = AUTH_BASE_URL + '/oauth/token'
const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const DEVICE_USER_CODE_URL = AUTH_BASE_URL + '/api/accounts/deviceauth/usercode'
const DEVICE_TOKEN_URL = AUTH_BASE_URL + '/api/accounts/deviceauth/token'
const DEVICE_VERIFICATION_URI = AUTH_BASE_URL + '/codex/device'
const DEVICE_REDIRECT_URI = AUTH_BASE_URL + '/deviceauth/callback'
const SCOPE = 'openid profile email offline_access'
const JWT_CLAIM_PATH = 'https://api.openai.com/auth'

function credentialPath() {
  const home = (process.env.DSH_HOME ?? '').trim() || join(homedir(), '.dsh')
  return join(home, 'chatgpt-oauth.json')
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generatePKCE() {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function createState() {
  return randomBytes(16).toString('hex')
}

function openBrowser(url) {
  const command = process.platform === 'darwin'
    ? { cmd: 'open', args: [url] }
    : process.platform === 'win32'
      ? { cmd: 'cmd', args: ['/c', 'start', '', url] }
      : { cmd: 'xdg-open', args: [url] }
  const child = spawn(command.cmd, command.args, { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
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

// ---- browser flow ----
async function browserLogin() {
  const { verifier, challenge } = await generatePKCE()
  const state = createState()
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  url.searchParams.set('id_token_add_organizations', 'true')
  url.searchParams.set('codex_cli_simplified_flow', 'true')
  url.searchParams.set('originator', 'pi')

  // The registered URI uses localhost; bind the listener to loopback before opening the browser.
  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '', 'http://localhost')
      const respond = (status, body) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(body)
      }
      if (reqUrl.pathname !== '/auth/callback') {
        respond(404, '<h1>Not found</h1>')
        return
      }
      let codeValue
      try {
        codeValue = validateCallback({ state: reqUrl.searchParams.get('state'), code: reqUrl.searchParams.get('code') }, state)
      } catch (error) {
        respond(400, '<h1>' + (error.message.includes('state') ? 'State mismatch' : 'Missing authorization code') + '</h1>')
        return
      }
      respond(200, '<h1>OpenAI authentication completed. You can close this window.</h1>')
      server.close()
      resolve(codeValue)
    })
    server.on('error', (error) => reject(error))
    server.listen(1455, '127.0.0.1', () => {})
  })

  return exchangeAuthorizationCode(code, verifier, REDIRECT_URI)
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
    const credential = args.includes('--device') ? await deviceLogin() : await browserLogin()
    await writeCredential(credential)
    console.log('Signed in to ChatGPT (Codex). Account: ' + (credential.accountId ?? 'unknown'))
    console.log('Token expires: ' + new Date(credential.expires).toISOString())
  } catch (error) {
    console.error('Login failed: ' + (error?.message ?? String(error)))
    process.exitCode = 1
  }
}

await main()
