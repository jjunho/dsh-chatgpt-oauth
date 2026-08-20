# dsh-chatgpt-oauth OSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing ChatGPT OAuth plugin into a standalone, public, security-conscious GitHub project that can be installed as a DeepSeek Harness Cordis bundle.

**Architecture:** Keep the runtime as plain ESM JavaScript with no build step. The plugin registers `openai-codex` through the existing DSH `PiAiAdapter`; the standalone CLI owns PKCE login; `credentials.js` owns secure local persistence; GitHub workflows own reproducible checks.

**Tech Stack:** Node.js 22.19+/24, ESM, pnpm, Node built-in test runner, GitHub Actions, DeepSeek Harness Cordis, `@deepseek-ai/dsh-llm-pi-ai`, and `@earendil-works/pi-ai`.

## Global Constraints

- Publish only the plugin project; never stage the DeepSeek Harness checkout.
- Public repository and package name: `dsh-chatgpt-oauth`.
- Initial package version: `0.1.0`.
- License: MIT with project-contributor copyright, not DeepSeek copyright.
- Runtime remains Node.js ESM with no build step.
- Use pnpm and commit exactly one `pnpm-lock.yaml`.
- Do not include real OAuth credentials, access tokens, refresh tokens, or callback state in the repository.
- Keep the OAuth callback bound to `127.0.0.1:1455` and validate PKCE state.
- Keep the local credential file owner-readable only (`0600`).
- Report the GitHub description and topics after the remote repository exists.

---

## File Map

- Modify `package.json`: public package identity, bounded peer ranges, scripts, engines, exports, metadata, and package contents.
- Modify `index.js`: retain the provider adapter and context metadata overrides; harden durable-credential validation and refresh failures.
- Modify `credentials.js`: validate and persist the credential document securely.
- Modify `bin/login.mjs`: keep browser/device OAuth behavior, remove unused imports, redact malformed-response diagnostics, and use portable path handling.
- Modify `cordis.patch.yml`: reference the unscoped public package name.
- Create `test/model-metadata.test.mjs`: assert provider registration, model metadata, and unaffected catalog entries.
- Create `test/credentials.test.mjs`: assert absent, valid, malformed, atomic, and permissioned credential files.
- Create `test/cli-syntax.test.mjs`: assert the standalone CLI parses with Node without opening a browser or network connection.
- Modify `README.md`: public quick start, install paths, OAuth behavior, metadata caveat, troubleshooting, and GitHub description copy.
- Create `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `CHANGELOG.md`.
- Create `.gitignore` and `.npmrc` for a standalone package boundary.
- Create `.github/workflows/ci.yml`, `.github/dependabot.yml`, issue forms, and pull-request template.
- Remove temporary `test-context.mjs` after moving its assertions into the test suite.
- Remove internal `docs/superpowers/` files from the final public tree after preserving the approved design in the Git history; keep a concise public `docs/architecture.md` if the information benefits users.

## Task 1: Make the package independently installable

**Files:**
- Modify: `package.json`
- Modify: `cordis.patch.yml`
- Modify: `.gitignore`
- Create: `.npmrc`
- Test: `test/package-metadata.test.mjs`

**Interfaces:**
- Produces the public package name `dsh-chatgpt-oauth` and the installable Cordis bundle metadata used by later CI and release tasks.

- [ ] **Step 1: Write package metadata assertions**

Create a small Node assertion script in `test/package-metadata.test.mjs` that imports `package.json` with JSON modules and asserts `name`, `version`, `private`, `type`, `exports`, `bin`, `engines`, `packageManager`, and the bounded peer ranges. The test must assert that the bundle patch names `dsh-chatgpt-oauth`, not the DeepSeek namespace.

- [ ] **Step 2: Run the metadata test and confirm it fails**

Run:

```sh
node --test test/package-metadata.test.mjs
```

Expected: failure because the current package is private, scoped as `@deepseek-ai/dsh-chatgpt-oauth`, and has wildcard peers.

- [ ] **Step 3: Update package metadata**

Set the manifest to the following essential values while retaining the existing runtime entry points:

```json
{
  "name": "dsh-chatgpt-oauth",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "main": "./index.js",
  "exports": { ".": "./index.js", "./credentials": "./credentials.js" },
  "license": "MIT",
  "engines": { "node": ">=22.19.0" },
  "packageManager": "pnpm@11.10.0",
  "scripts": {
    "check": "node --check index.js && node --check credentials.js && node --check bin/login.mjs",
    "test": "node --test",
    "pack:check": "pnpm pack --dry-run"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": ">=4.0.1 <5.0.0",
    "@deepseek-ai/dsh-llm": ">=0.1.0-rc.7 <0.2.0",
    "@deepseek-ai/dsh-llm-pi-ai": ">=0.1.0-rc.7 <0.2.0",
    "@earendil-works/pi-ai": ">=0.82.1 <0.83.0"
  }
}
```

Use `files` to include runtime files, `README.md`, `LICENSE`, and `cordis.patch.yml`, while excluding tests and local development files from the package tarball. Set `.npmrc` to `ignore-scripts=true` because this package has no install-time build step.

- [ ] **Step 4: Rename the bundle patch package reference**

Change the inserted row in `cordis.patch.yml` to:

```yaml
- insert:
    - id: chatgpt-oauth
      name: 'dsh-chatgpt-oauth'
```

- [ ] **Step 5: Run metadata and syntax checks**

Run `pnpm test` and `pnpm run check`; expected result is a passing metadata test and zero Node syntax errors.

- [ ] **Step 6: Commit the package boundary**

```sh
git add package.json cordis.patch.yml .gitignore .npmrc test/package-metadata.test.mjs
git commit -m "chore: prepare standalone package metadata"
```

## Task 2: Harden credential and OAuth boundaries

**Files:**
- Modify: `credentials.js`
- Modify: `index.js`
- Modify: `bin/login.mjs`
- Test: `test/credentials.test.mjs`
- Test: `test/cli-syntax.test.mjs`

**Interfaces:**
- `readCredential()` returns `undefined` for an absent file and a validated credential object for valid durable data.
- `writeCredential(credential)` writes atomically and leaves the final file at mode `0600`.
- The adapter raises `MISSING_CREDENTIAL` for absent or invalid durable credentials without exposing token contents.

- [ ] **Step 1: Write failing durable-credential tests**

Use `node:test`, `node:assert/strict`, and `mkdtemp`. Set `process.env.DSH_HOME` to a temporary directory for each test and restore it in `t.after`. Cover:

```js
test('missing credential returns undefined', async () => { /* assert readCredential() === undefined */ })
test('write/read round trip preserves fields and mode 0600', async () => { /* write, read, stat */ })
test('malformed JSON is rejected without returning token-like content', async () => { /* write invalid JSON, assert rejection */ })
test('credential missing access, refresh, or finite expiry is rejected', async () => { /* assert validation failure */ })
```

- [ ] **Step 2: Run the focused credential tests and confirm the missing validation fails**

Run `node --test test/credentials.test.mjs`; expected failure against the current unvalidated parser or missing boundary checks.

- [ ] **Step 3: Add durable credential validation**

Validate the parsed object before returning it. Require non-empty string `access` and `refresh`, finite positive numeric `expires`, and allow an optional string `accountId`. Throw a generic error that names the document but never includes parsed values. Keep `ENOENT` mapped to `undefined`.

- [ ] **Step 4: Harden refresh failure handling**

In `index.js`, catch OAuth refresh failures and rethrow an `LlmError` with a stable authentication code and generic message. Do not include the access token, refresh token, or provider response body. Preserve atomic persistence of the rotated credential.

- [ ] **Step 5: Remove CLI leakage and portability hazards**

In `bin/login.mjs`:

- Remove unused `readFile` and `createInterface` imports.
- Import and use `dirname` instead of slicing a POSIX slash from the credential path.
- Replace malformed token-response `JSON.stringify(json)` diagnostics with a generic missing-fields message.
- Avoid printing full device-token response bodies on failure; include only status and a bounded error code.
- Add a finite device-code deadline of 15 minutes and stop polling with a generic timeout message.

- [ ] **Step 6: Add CLI parse verification**

Run the CLI with `--logout` against a temporary `DSH_HOME`; assert exit code 0 and no credential file. Run `node --check bin/login.mjs` in the test command; do not import the CLI because its entry point intentionally runs the command.

- [ ] **Step 7: Run focused security tests**

Run `node --test test/credentials.test.mjs test/cli-syntax.test.mjs`; expected result is zero failures and a final credential mode of `0600`.

- [ ] **Step 8: Commit OAuth hardening**

```sh
git add credentials.js index.js bin/login.mjs test/credentials.test.mjs test/cli-syntax.test.mjs
git commit -m "fix: harden OAuth credential handling"
```

## Task 3: Move regression coverage into the standalone test suite

**Files:**
- Create: `test/model-metadata.test.mjs`
- Create: `test/adapter-auth.test.mjs`
- Remove: `test-context.mjs`

**Interfaces:**
- Tests exercise the public plugin `apply(ctx)` boundary with a small fake LLM registry and never require live DSH web boot or a real account.

- [ ] **Step 1: Port the context regression test**

Create a test that calls `apply(ctx)`, captures the registered adapter, resolves `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, and `gpt-5.6-terra` as `1_050_000`, and asserts `gpt-5.4` remains `272_000`.

- [ ] **Step 2: Add adapter authentication tests**

Use a temporary `DSH_HOME` with no credential and assert a stream attempt reaches `MISSING_CREDENTIAL` before network access. Add a valid synthetic credential and assert the credential resolver returns the access token without logging its value.

- [ ] **Step 3: Run the suite**

Run `pnpm test`; expected result is all tests passing without network access.

- [ ] **Step 4: Remove the temporary root test**

Delete `test-context.mjs` after its assertions are covered by the permanent tests.

- [ ] **Step 5: Commit regression coverage**

```sh
git add test && git rm test-context.mjs
git commit -m "test: cover plugin metadata and authentication"
```

## Task 4: Create public documentation and governance files

**Files:**
- Modify: `README.md`
- Create: `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/ISSUE_TEMPLATE/config.yml`
- Create: `docs/architecture.md`
- Remove: `docs/superpowers/` from the final public tree

**Interfaces:**
- Public docs describe the package independently of the development checkout.
- Security reporting tells users not to include OAuth credentials in public issues.

- [ ] **Step 1: Rewrite the README for a public audience**

Use the approved description verbatim near the title:

> ChatGPT OAuth (PKCE) plugin for DeepSeek Harness — use ChatGPT Plus/Pro through the openai-codex provider without an API key.

Document GitHub installation as `dsh plugin --profile web add github:OWNER/dsh-chatgpt-oauth`, local installation as `file:/absolute/path`, browser login, `--device`, `--logout`, `/chatgpt`, supported models, the `1_050_000` metadata override, troubleshooting, external endpoint limitations, and the fact that ChatGPT subscription access is controlled by OpenAI and can change.

- [ ] **Step 2: Add community health files**

Use MIT licensing, Contributor Covenant language, GitHub Discussions/issues as the contribution path, and GitHub private vulnerability reporting as the security path. Do not invent an email address or publish a maintainer's private contact.

- [ ] **Step 3: Add a public architecture note**

Move the useful runtime architecture from the approved design into `docs/architecture.md`. Remove agent-specific planning language and keep only package boundaries, credential flow, provider registration, and compatibility constraints.

- [ ] **Step 4: Add issue and pull-request templates**

Require reproduction steps, DSH version, plugin version, provider/model, sanitized logs, tests, and confirmation that no credential was included.

- [ ] **Step 5: Commit public documentation**

```sh
git add README.md LICENSE SECURITY.md CONTRIBUTING.md CODE_OF_CONDUCT.md CHANGELOG.md docs .github/PULL_REQUEST_TEMPLATE.md .github/ISSUE_TEMPLATE
git commit -m "docs: add OSS project governance"
```

## Task 5: Add reproducible CI and supply-chain checks

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Modify: `package.json` scripts if CI needs a dedicated command
- Create: `.github/workflows/dependency-review.yml` if kept separate from CI

**Interfaces:**
- Every pull request and push to `main` gets the same frozen-install, syntax, test, package, and audit gates.

- [ ] **Step 1: Generate the standalone lockfile**

Run `pnpm install --lockfile-only` from the project root after the package metadata is final. Commit only `pnpm-lock.yaml` for this project; never reuse the DSH monorepo lockfile.

- [ ] **Step 2: Write the CI workflow**

Use `actions/checkout@v4`, `pnpm/action-setup@v4` with pnpm `11.10.0`, and `actions/setup-node@v4` with Node `22.x` and `24.x`. Run `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm run check`, `pnpm test`, `pnpm pack:check`, and `pnpm audit --audit-level=high`. Add a focused `git grep` step for common credential prefixes such as `sk-`, `ghp_`, and `AIza` without matching ordinary field names like `access_token`.

- [ ] **Step 3: Add dependency review and Dependabot**

Use `actions/dependency-review-action@v4` for pull requests and configure weekly npm and GitHub Actions updates in `.github/dependabot.yml`.

- [ ] **Step 4: Validate the package boundary**

Run `pnpm pack --dry-run` and assert the output contains runtime files, README, and license but excludes `test/`, `.git/`, credentials, and development metadata.

- [ ] **Step 5: Commit automation**

```sh
git add package.json pnpm-lock.yaml .github
git commit -m "ci: add reproducible OSS checks"
```

## Task 6: Release-readiness audit and GitHub publication

**Files:**
- Inspect: all tracked files and `git diff`
- Modify: any file required by failed checks
- Remote: GitHub repository `dsh-chatgpt-oauth` under the confirmed owner

**Interfaces:**
- The public repository contains only the standalone plugin and its documentation.
- The GitHub repository has its description and topics configured after creation.

- [ ] **Step 1: Run the complete local gate**

Run, in order:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pnpm test
pnpm pack:check
pnpm audit --audit-level=high
if git grep -nE 'sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}' -- . ':!pnpm-lock.yaml'; then echo 'credential-like material found'; exit 1; fi
git status --short
```

The secret scan must return no matches; audit findings must be recorded and either fixed or explicitly reported before publication.

- [ ] **Step 2: Confirm the nested repository contains no DSH checkout**

Run `git ls-files` from `plugin-chatgpt-oauth` and assert no path begins with `apps/`, `packages/`, `vendor/`, `python/`, or `website/`. The parent DeepSeek Harness repository must remain unstaged and outside the nested project's history.

- [ ] **Step 3: Create the GitHub repository only after owner confirmation**

```sh
gh repo create "$GITHUB_OWNER/dsh-chatgpt-oauth" --public --source . --remote origin --description "ChatGPT OAuth (PKCE) plugin for DeepSeek Harness — use ChatGPT Plus/Pro through the openai-codex provider without an API key."
git push -u origin main
```

- [ ] **Step 4: Configure GitHub topics**

```sh
gh repo edit "$GITHUB_OWNER/dsh-chatgpt-oauth" --description "ChatGPT OAuth (PKCE) plugin for DeepSeek Harness — use ChatGPT Plus/Pro through the openai-codex provider without an API key." --add-topic deepseek-harness --add-topic chatgpt --add-topic chatgpt-plus --add-topic chatgpt-pro --add-topic oauth --add-topic pkce --add-topic openai-codex --add-topic codex --add-topic llm --add-topic ai --add-topic nodejs --add-topic cordis --add-topic developer-tools
```

- [ ] **Step 5: Verify the published repository**

Check the public README, license, security policy, Actions result, default branch, topics, and install command. Do not create a release until the CI workflow is green.

## Checkpoints

### Checkpoint A: package boundary

- [ ] Metadata test passes.
- [ ] The package is unscoped, non-private, and has bounded peers.
- [ ] The Cordis patch references the public package name.

### Checkpoint B: runtime and security

- [ ] Credential and metadata tests pass without network access.
- [ ] OAuth errors do not expose token contents.
- [ ] The credential file remains mode `0600`.

### Checkpoint C: public repository

- [ ] README and community files are complete.
- [ ] Frozen CI passes on Node 22 and Node 24.
- [ ] The package dry-run contains only intended files.
- [ ] No DeepSeek Harness checkout files are in the nested repository history.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| OpenAI changes the Codex OAuth contract | Login or refresh stops working | Document the external dependency, keep OAuth logic isolated, and accept issues with sanitized diagnostics |
| Wildcard peers resolve incompatible DSH versions | Plugin fails at load or stream time | Use bounded peer ranges and test against the installed DSH compatibility floor |
| A credential is accidentally committed | Account compromise | Ignore credential paths, scan tracked files, reject token-like prefixes in CI, and document rotation/reporting |
| Local GitHub owner is not known | Remote creation cannot be completed | Keep publication commands parameterized and request the owner before `gh repo create` |
| Context metadata differs by provider | Misleading UI or premature overflow classification | Document that the `1_050_000` override is provider-installation-specific and test both overridden and untouched models |

## Open questions

- The GitHub account or organization owner is still required before remote creation and metadata updates.
