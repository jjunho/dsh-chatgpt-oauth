# dsh-chatgpt-oauth

> ChatGPT OAuth (PKCE) plugin for DeepSeek Harness — use ChatGPT Plus/Pro through the openai-codex provider without an API key.

This plugin adds the openai-codex provider to DeepSeek Harness using ChatGPT OAuth (PKCE) and a ChatGPT Plus or Pro subscription rather than an API key.

## Requirements

- DeepSeek Harness with the web profile
- Node.js 22.19 or newer
- An eligible ChatGPT Plus or Pro account

## Install

GitHub:

    dsh plugin --profile web add github:jjunho/dsh-chatgpt-oauth

Local checkout (use an absolute path):

    dsh plugin --profile web add file:/absolute/path/to/dsh-chatgpt-oauth

Restart the web profile after installation.

## Sign in

    dsh plugin --profile web exec dsh-chatgpt-login
    dsh plugin --profile web exec dsh-chatgpt-login -- --device
    dsh plugin --profile web exec dsh-chatgpt-login -- --logout

The browser flow uses 127.0.0.1:1455. Credentials are stored at $DSH_HOME/chatgpt-oauth.json, or ~/.dsh/chatgpt-oauth.json when DSH_HOME is unset. The file is owner-readable only and refreshed credentials are saved automatically. Never share it.

## Use ChatGPT models

1. Select the ChatGPT (Codex) provider.
2. Choose gpt-5.3-codex-spark, gpt-5.4, gpt-5.4-mini, gpt-5.5, gpt-5.6-luna, gpt-5.6-sol, or gpt-5.6-terra.
3. Use /chatgpt for sign-in status, /chatgpt logout to clear the session, and /chatgpt reinstall for recovery steps after a dsh update.

For gpt-5.5 and gpt-5.6-*, this plugin reports local context metadata of 1_050_000 tokens. This affects the local context meter only and does not guarantee a universal model capability.

## Troubleshooting

- Provider missing: restart dsh web and confirm the plugin was added to the web profile.
- Browser login fails: ensure port 1455 is available; use --device on a headless host.
- Authentication expired: run dsh-chatgpt-login again, or use --logout before another account.
- Model unavailable: check current account entitlements and the provider model list.

## After a dsh update

A DeepSeek Harness update can bump its bundled `@earendil-works/pi-ai` engine. This plugin rides pi-ai's `openai-codex` provider and its OAuth method, so such an update can break the OAuth route. To keep a single break from cascading, the plugin **degrades gracefully**: instead of crashing on load, it logs a warning and leaves `openai-codex` unregistered, so the other providers keep working.

If "ChatGPT (Codex)" disappears from the model selector after an update:

1. Run `/chatgpt reinstall` inside the harness to print the exact recovery steps.
2. Re-link the plugin into the profile and restart:

       cd ~/.dsh/profiles/web && pnpm install
       dsh --profile web

3. Sign in again if the token was invalidated:

       dsh-chatgpt-login

4. If pi-ai changed its OAuth API (for example, removed `auth.oauth` from the provider), update this plugin's source first — it lives at `~/x/dsh-chatgpt-oauth` (`index.js` / `package.json`) — then redo step 2 so the change is picked up.

The plugin's `peerDependencies` range for `@earendil-works/pi-ai` is kept wide (`>=0.82.1`), so a minor engine bump does not fail installation on its own; only an actual API change requires editing the plugin.

## Limitations

The openai-codex route calls ChatGPT's external chatgpt.com/backend-api endpoint. It is not the OpenAI Completions API. OpenAI controls subscription access, the OAuth client contract, endpoint behavior, and model availability; these may change without notice. This plugin cannot guarantee compatibility after an upstream change.

See docs/architecture.md and SECURITY.md.

## Project metadata

Approved topics: deepseek-harness, chatgpt, chatgpt-plus, chatgpt-pro, oauth, pkce, openai-codex, codex, llm, ai, nodejs, cordis, developer-tools.

Licensed under the MIT License.
