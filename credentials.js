// Shared OAuth credential persistence for the ChatGPT (Codex) plugin and its
// standalone login CLI. Zero-dependency on purpose: the login script runs
// outside the harness (and outside the harness module fallback), so this
// module resolves the credential file from $DSH_HOME (or ~/.dsh) with only
// node built-ins. The plugin's adapter imports this same module, which is
// what keeps the two views of "logged in" consistent.
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'

/**
 * Absolute path of the persisted credential document.
 * @returns $DSH_HOME/chatgpt-oauth.json (default ~/.dsh/chatgpt-oauth.json).
 */
export function credentialPath() {
  const home = (process.env.DSH_HOME ?? '').trim() || join(homedir(), '.dsh')
  return join(home, 'chatgpt-oauth.json')
}

/**
 * Read the persisted credential, or `undefined` when absent.
 * @returns the credential object, or undefined when the file does not exist.
 */
export async function readCredential() {
  let content
  try {
    content = await readFile(credentialPath(), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }

  let credential
  try {
    credential = JSON.parse(content)
  } catch {
    throw new Error('invalid ChatGPT OAuth credential document')
  }
  return validateCredential(credential)
}

function validateCredential(credential) {
  if (credential === null || typeof credential !== 'object' ||
      typeof credential.access !== 'string' || credential.access.length === 0 ||
      typeof credential.refresh !== 'string' || credential.refresh.length === 0 ||
      typeof credential.expires !== 'number' || !Number.isFinite(credential.expires) || credential.expires <= 0 ||
      (credential.accountId !== undefined && typeof credential.accountId !== 'string')) {
    throw new Error('invalid ChatGPT OAuth credential document')
  }
  return credential
}

/**
 * Persist one credential atomically with owner-only permissions.
 * @param credential - { access, refresh, expires, accountId } (plus any extra fields).
 */
export async function writeCredential(credential) {
  validateCredential(credential)
  const path = credentialPath()
  await mkdir(dirname(path), { recursive: true })
  const tmp = path + '.tmp'
  await writeFile(tmp, JSON.stringify(credential, null, 2) + '\n', { mode: 0o600 })
  await rename(tmp, path)
  await chmod(path, 0o600)
}

/** Remove the persisted credential; absence is not an error. */
export async function deleteCredential() {
  await unlink(credentialPath()).catch((error) => {
    if (error?.code !== 'ENOENT') throw error
  })
}
