// ChatGPT (Codex) OAuth provider for DeepSeek Harness.
//
// Registers the `openai-codex` provider route (ChatGPT Plus/Pro subscription)
// on the harness LLM seam, reusing the pi-ai provider engine that ships with
// `@deepseek-ai/dsh-llm-pi-ai` and the generic `PiAiAdapter`. Because pi-ai
// resolves an api-key override only when the provider declares an api-key
// method, we add one that passes the OAuth access token straight through; the
// token itself is read from (and lazily refreshed in) a file that the
// standalone `dsh-chatgpt-login` CLI writes after the browser OAuth flow.
//
// The login is interactive and browser-bound, so it lives in a separate
// terminal command rather than a slash command; `/chatgpt` here only reports
// status and clears the session.
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { builtinProviders } from '@earendil-works/pi-ai/providers/all'
import { readCredential, writeCredential, deleteCredential } from './credentials.js'

export const name = 'chatgpt-oauth'
export const inject = ['llm']

const PROVIDER = 'openai-codex'
const DISPLAY_NAME = 'ChatGPT (Codex)'

// Default provider idle interval and image payload bound, matching the
// pi-ai adapter's shipped defaults.
const STREAM_IDLE_TIMEOUT_MS = 300000
const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024

// The installed Codex catalog currently reports 272K for these model ids,
// while this user's working OpenCode catalog reports 1,050,000. Keep the
// provider-specific model metadata aligned with the working route.
const CONTEXT_WINDOW_OVERRIDES = new Map([
  ['gpt-5.5', 1_050_000],
  ['gpt-5.6-luna', 1_050_000],
  ['gpt-5.6-sol', 1_050_000],
  ['gpt-5.6-terra', 1_050_000],
])

// Self-service recovery guide, printed by `/chatgpt reinstall` and referenced
// by the degraded-mode warnings. Kept here, in one place, so the guidance and
// the failure modes it describes can't drift apart.
const REINSTALL_GUIDE = [
  'ChatGPT (Codex) OAuth — recovery after a dsh update:',
  '  1. Re-link this plugin into the profile (fixes a stale node_modules copy):',
  '       cd ~/.dsh/profiles/web && pnpm install',
  '  2. Restart dsh:',
  '       dsh --profile web',
  '  3. Sign in again if the token was invalidated:',
  '       dsh-chatgpt-login',
  '  4. If pi-ai changed its OAuth API, update this plugin first — its source',
  '     lives at ~/x/dsh-chatgpt-oauth (edit index.js / package.json), then',
  '     redo step 1 so the change is picked up.',
].join('\n')

export function apply(ctx) {
  const catalog = builtinProviders().find(provider => provider.id === PROVIDER)
  if (catalog === undefined) {
    // A pi-ai upgrade that drops the provider should disable this OAuth route,
    // not fail the plugin mount (which would also mask the cause in a sea of
    // plugin-load errors). Log once and leave `openai-codex` unregistered.
    ctx.logger.warn('chatgpt-oauth: the installed pi-ai engine ships no "openai-codex" provider; ChatGPT (Codex) OAuth is unavailable — run /chatgpt reinstall for recovery steps')
    return
  }
  const oauth = catalog.auth?.oauth
  if (oauth === undefined) {
    ctx.logger.warn('chatgpt-oauth: the "openai-codex" provider no longer exposes an OAuth method; ChatGPT (Codex) OAuth is unavailable — run /chatgpt reinstall for recovery steps')
    return
  }

  const models = catalog.getModels().map(model => {
    const contextWindow = CONTEXT_WINDOW_OVERRIDES.get(model.id)
    return contextWindow === undefined ? model : { ...model, contextWindow }
  })

  // pi-ai honors a request api-key override only when the provider declares an
  // api-key method, so add one that forwards the access token we resolve.
  const piProvider = {
    ...catalog,
    getModels: () => models,
    auth: {
      ...catalog.auth,
      apiKey: {
        name: 'ChatGPT access token',
        resolve: ({ credential }) => Promise.resolve({
          auth: credential?.key === undefined ? {} : { apiKey: credential.key },
          source: 'ChatGPT OAuth',
        }),
      },
    },
  }

  const profile = Object.freeze({
    provider: PROVIDER,
    displayName: DISPLAY_NAME,
    piProvider,
    streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
    retryPolicy: resolveRetryPolicy(undefined, 'chatgpt-oauth: retryPolicy'),
    configuredMaxTokens: new Map(),
  })
  const profiles = () => new Map([[PROVIDER, profile]])

  const resolveApiKey = async () => {
    let credential
    try {
      credential = await readCredential()
    } catch {
      throw new LlmError('chatgpt-oauth: stored ChatGPT credential is invalid; sign in again', 'MISSING_CREDENTIAL')
    }
    if (credential === undefined) {
      throw new LlmError(
        'chatgpt-oauth: not signed in to ChatGPT; run dsh-chatgpt-login in a terminal, then pick the "ChatGPT (Codex)" provider',
        'MISSING_CREDENTIAL',
      )
    }
    if (Date.now() < credential.expires) return credential.access
    try {
      const refreshed = await oauth.refresh(credential)
      await writeCredential(refreshed)
      return refreshed.access
    } catch {
      throw new LlmError('chatgpt-oauth: ChatGPT authentication expired; sign in again', 'AUTH')
    }
  }

  const adapter = new PiAiAdapter({
    profiles,
    resolveApiKey,
    resolveAttachments: () => ctx.get('attachments'),
    onReplayDegrade: ({ provider, model, reason }) => {
      ctx.logger.warn('chatgpt-oauth: replay state degraded for ' + provider + '/' + model + ': ' + reason)
    },
  })

  ctx.llm.registerAdapter([PROVIDER], adapter)

  const commands = ctx.get('commands')
  if (commands !== undefined) {
    commands.register({
      name: 'chatgpt',
      description: 'show or clear your ChatGPT (Codex) OAuth login, or print reinstall steps',
      input: { hint: '[status|logout|reinstall]' },
      handler: async (invocation) => {
        const arg = (invocation.rawInput ?? '').trim().toLowerCase()
        if (arg === 'reinstall' || arg === 'help' || arg === 'fix') {
          return { kind: 'success', text: REINSTALL_GUIDE }
        }
        if (arg === 'logout') {
          await deleteCredential()
          return { kind: 'success', text: 'ChatGPT session removed.' }
        }
        const credential = await readCredential()
        if (credential === undefined) {
          return { kind: 'success', text: 'ChatGPT (Codex): not signed in. Run dsh-chatgpt-login in a terminal.' }
        }
        const minutes = Math.max(0, Math.round((credential.expires - Date.now()) / 60000))
        const account = typeof credential.accountId === 'string' ? credential.accountId : 'unknown'
        return { kind: 'success', text: 'ChatGPT (Codex): signed in (account ' + account + '), token valid for ~' + minutes + ' min. Use /chatgpt logout to disconnect.' }
      },
    })
  }
}
