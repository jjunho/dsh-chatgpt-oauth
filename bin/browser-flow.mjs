import { randomBytes, createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { validateCallback } from './token-response.mjs'

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
export const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const SCOPE = 'openid profile email offline_access'

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

/**
 * Run the local-server OAuth browser flow.
 * @param {{ exchangeAuthorizationCode: (code: string, verifier: string, redirectUri: string) => Promise<unknown>, openBrowser?: (url: string) => void, output?: (...args: unknown[]) => void }} options
 * @returns {Promise<unknown>}
 */
export async function browserLogin({ exchangeAuthorizationCode, openBrowser: launch = openBrowser, output = console.log }) {
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
    server.on('error', reject)
    server.listen(1455, '127.0.0.1', () => {
      launch(url.toString())
      output('Open this URL if the browser did not open:')
      output('  ' + url.toString())
    })
  })

  return exchangeAuthorizationCode(code, verifier, REDIRECT_URI)
}
