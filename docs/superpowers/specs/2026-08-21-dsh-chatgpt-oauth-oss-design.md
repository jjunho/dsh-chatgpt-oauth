# dsh-chatgpt-oauth OSS project design

## Goal

Publish the ChatGPT OAuth plugin as an independent public GitHub repository named `dsh-chatgpt-oauth`, without publishing or forking the DeepSeek Harness source checkout used during development.

The repository will remain an installable DeepSeek Harness Cordis bundle and will support ChatGPT Plus/Pro authentication through the `openai-codex` provider without an API key.

## Scope

Included:

- The Cordis plugin and bundle patch.
- The standalone browser/device-code OAuth login CLI.
- File-backed credential persistence and token refresh.
- Tests that use synthetic credentials and model metadata.
- Public documentation, contribution policy, security policy, license, changelog, and GitHub automation.

Excluded:

- DeepSeek Harness source files.
- A fork or modified copy of the DSH monorepo.
- Real ChatGPT credentials or live OAuth responses in tests.
- A web GUI login implementation.
- Automatic GitHub repository creation or push without explicit remote confirmation.

## Package identity

- Repository: `dsh-chatgpt-oauth`.
- Package: `dsh-chatgpt-oauth`.
- Initial version: `0.1.0`.
- License: MIT, owned by the project contributors rather than DeepSeek.
- Runtime: Node.js ESM; no build step.
- Package manager: pnpm with a committed lockfile.

The package will use compatible, bounded peer ranges for DSH and pi-ai dependencies instead of wildcard peer versions. The Cordis bundle patch will reference `dsh-chatgpt-oauth`.

## Runtime architecture

`index.js` registers the `openai-codex` route through the existing `PiAiAdapter` and pi-ai provider catalog. The plugin adds the access-token auth adapter required for pi-ai's request override path.

`credentials.js` stores OAuth credentials at `$DSH_HOME/chatgpt-oauth.json`, defaults to `~/.dsh/chatgpt-oauth.json`, writes atomically, and enforces mode `0600`.

`bin/login.mjs` performs the browser PKCE flow or device-code flow using Node built-ins, validates OAuth state, exchanges the authorization code, extracts the account id from the access-token claims, and writes the credential document.

The plugin overrides context metadata for `gpt-5.5` and `gpt-5.6-*` to `1_050_000` tokens to match the working OpenCode route in the target installation. This is local provider metadata; it does not alter the OAuth protocol or claim a universal model capability.

## Public project layout

`README.md` will be the primary user guide and will include the GitHub installation command, browser login, device-code login, logout, model selection, context metadata note, troubleshooting, limitations, and upgrade guidance.

Community and governance files:

- `LICENSE` — MIT.
- `SECURITY.md` — token handling, reporting process, and supported versions.
- `CONTRIBUTING.md` — setup, tests, branch/commit expectations, and pull requests.
- `CODE_OF_CONDUCT.md` — Contributor Covenant.
- `CHANGELOG.md` — release history.

Automation:

- `.github/workflows/ci.yml` — frozen pnpm install, syntax checks, tests, package dry-run, secret scan, and dependency audit.
- `.github/ISSUE_TEMPLATE/` — bug report and feature request forms.
- `.github/PULL_REQUEST_TEMPLATE.md` — scope, tests, security, and compatibility checklist.

## GitHub metadata

After the remote repository exists, configure this description:

> ChatGPT OAuth (PKCE) plugin for DeepSeek Harness — use ChatGPT Plus/Pro through the openai-codex provider without an API key.

Configure these topics:

`deepseek-harness`, `chatgpt`, `chatgpt-plus`, `chatgpt-pro`, `oauth`, `pkce`, `openai-codex`, `codex`, `llm`, `ai`, `nodejs`, `cordis`, `developer-tools`.

The metadata will be set with `gh repo edit` after the owner and remote are confirmed.

## Security requirements

- Never commit access tokens, refresh tokens, credential files, or OAuth callback URLs containing state.
- Keep the local callback bound to `127.0.0.1:1455`.
- Validate the OAuth state before exchanging a code.
- Keep credential files owner-readable only.
- Do not print access tokens in diagnostics or malformed-response errors.
- Keep live OAuth out of automated tests.
- Document that the Codex endpoint and OAuth client contract are external dependencies that may change.

## Verification and release gates

Before publication:

1. Run all focused unit/integration tests with synthetic data.
2. Run Node syntax checks for every runtime module.
3. Run `pnpm pack --dry-run` and verify only intended files are included.
4. Run the native pnpm audit and record any remaining findings.
5. Scan tracked files for credential-like material.
6. Verify a clean frozen install from the committed lockfile.
7. Verify the GitHub Actions workflow on the default branch.
8. Configure the repository description and topics.
9. Create the first release only after the public README and security policy are present.

## References

- GitHub repository best practices: https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories
- GitHub community health files: https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file
- GitHub dependency review: https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/configure-dependency-review-action
