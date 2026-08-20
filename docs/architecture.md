# Architecture

This repository is a standalone Node.js ESM plugin and Cordis bundle patch for DeepSeek Harness. It does not contain the DeepSeek Harness source tree.

## Package boundaries

- index.js registers the openai-codex route through DSH PiAiAdapter and the pi-ai provider catalog.
- credentials.js owns path resolution, validation, atomic writes, secure permissions, and refresh persistence.
- bin/login.mjs owns browser PKCE and device-code login, state validation, token exchange, account-id extraction, and logout.
- cordis.patch.yml supplies the bundle patch consumed by the DSH plugin installer.

The runtime has no build step. DSH and pi-ai are peer dependencies supplied by the host.

## Credential flow

The CLI validates OAuth state, exchanges the authorization code, and writes credentials to $DSH_HOME/chatgpt-oauth.json (default ~/.dsh/chatgpt-oauth.json). Writes are atomic and the file is mode 0600. The provider reads credentials for requests and persists rotated credentials after refresh. Tokens are not logged or included in public reports.

The browser callback binds to 127.0.0.1:1455. Device-code login avoids the callback for headless environments.

## Provider registration

index.js registers the provider and supported models with the DSH LLM registry. Requests use pi-ai's ChatGPT Codex path with the OAuth access token and account identity from the credential document. The chat command reports status and can remove the credential.

For gpt-5.5 and gpt-5.6-*, the plugin overrides local context metadata to 1_050_000 tokens. This is installation-specific metadata and does not alter the upstream protocol.

## Compatibility constraints

The route depends on chatgpt.com/backend-api, OpenAI's OAuth contract, DSH's PiAiAdapter seam, and compatible pi-ai APIs. Any can change independently. Bounded peer ranges express tested DSH and pi-ai versions; subscription access and model availability remain controlled by OpenAI.
