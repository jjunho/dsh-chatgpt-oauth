# dsh-chatgpt-oauth

Adds a **ChatGPT (Codex)** provider to DeepSeek Harness, authenticated through
your ChatGPT Plus/Pro **subscription** (OAuth) instead of an API key. It reuses
the pi-ai provider engine that already ships inside `@deepseek-ai/dsh-llm-pi-ai`,
so no DSH recompile is required — this is a plain plugin/bundle.

## How it works

- The plugin registers the `openai-codex` route (models `gpt-5.3-codex-spark`,
  `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`,
  `gpt-5.6-terra`) on the harness LLM seam via `PiAiAdapter`.
- The OAuth access token is read from (and lazily refreshed in)
  `$DSH_HOME/chatgpt-oauth.json` (default `~/.dsh/chatgpt-oauth.json`, mode 0600).
- A standalone `dsh-chatgpt-login` CLI runs the OpenAI Codex PKCE flow, opens
  the browser, and writes the token file. Login is interactive and browser-bound,
  so it lives in the terminal rather than in a slash command.

## Install

```sh
dsh plugin --profile web add file:/abs/path/to/plugin-chatgpt-oauth
```

The package declares `dsh.bundle.patch`, so `dsh plugin` adds it to the profile's
bundle stack automatically.

## Sign in (required once)

Run in a terminal:

```sh
node /abs/path/to/plugin-chatgpt-oauth/bin/login.mjs            # browser login
node /abs/path/to/plugin-chatgpt-oauth/bin/login.mjs --device   # device-code (headless)
node /abs/path/to/plugin-chatgpt-oauth/bin/login.mjs --logout   # remove the token
```

Complete the ChatGPT login in the browser. The token (access + refresh) is stored
at `~/.dsh/chatgpt-oauth.json` and auto-refreshes on each request.

## Use it

1. Restart the harness (`dsh web`) so the plugin loads.
2. Pick the **ChatGPT (Codex)** provider and one of its models in the model picker.
3. In chat, `/chatgpt` shows sign-in status; `/chatgpt logout` clears the session.

## Notes

- The `openai-codex` endpoint (`chatgpt.com/backend-api`) is ChatGPT's own
  protocol, not OpenAI-completions, so it cannot be reached with a plain key or
  the `llm-pi-ai` settings section — that is exactly what this plugin adds.
- For `gpt-5.5` and `gpt-5.6-*`, the plugin reports a 1,050,000-token context
  window, matching the working OpenCode route in this DSH installation; this
  changes the local model metadata and context meter, not the OAuth protocol.
- Requests carry the OAuth access token as a Bearer header; the account id is
  derived from the token by pi-ai.
