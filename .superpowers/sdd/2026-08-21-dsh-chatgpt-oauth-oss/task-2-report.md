# Task 2 Report: Harden credential and OAuth boundaries

## Files changed
- credentials.js: durable credential validation, generic parse/validation errors, atomic 0600 persistence.
- index.js: generic MISSING_CREDENTIAL and AUTH handling without token/provider-body leakage.
- bin/login.mjs: portable dirname, bounded diagnostics, 15-minute device deadline, and 0600 persistence.
- test/credentials.test.mjs: durable credential tests.
- test/cli-syntax.test.mjs: CLI syntax and logout tests.

## Commit
- f374d864e1ff0779b93676f790857bcda381aacd — fix: harden OAuth credential handling

## Exact commands and output

Command: node --test test/credentials.test.mjs (red phase)

Output: exit 1; 2 passed, 2 failed. The malformed JSON assertion failed because the old parser exposed the native parse diagnostic, and invalid credential objects were accepted. This was the expected failing validation phase.

Command: node --test test/credentials.test.mjs test/cli-syntax.test.mjs

Output:

✔ CLI parses and logout leaves no credential file (85.459678ms)
✔ missing credential returns undefined (5.468971ms)
✔ write/read round trip preserves fields and mode 0600 (6.943823ms)
✔ malformed JSON is rejected without returning token-like content (2.945163ms)
✔ credential missing access, refresh, or finite expiry is rejected (1.998163ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 133.870877

Command: node --check credentials.js && node --check index.js && node --check bin/login.mjs

Output: exit 0; no output.

Command: node --test

Output: exit 1. The exact failure was:

Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@deepseek-ai/dsh-llm-pi-ai' imported from /home/jjunho/Nextcloud/volapuk/oauth-dsh/plugin-chatgpt-oauth/.worktrees/oss-prep/index.js
✖ test-context.mjs (38.142344ms)
✔ CLI parses and logout leaves no credential file (102.718732ms)
✔ missing credential returns undefined (6.070239ms)
✔ write/read round trip preserves fields and mode 0600 (5.305331ms)
✔ malformed JSON is rejected without returning token-like content (4.282706ms)
✔ credential missing access, refresh, or finite expiry is rejected (3.200925ms)
✔ publishes standalone package metadata (6.203428ms)
ℹ tests 7
ℹ pass 6
ℹ fail 1

Command: git diff --cached --check

Output: exit 0; no output.

Command: git commit -m "fix: harden OAuth credential handling"

Output: exit 0; commit f374d864e1ff0779b93676f790857bcda381aacd.

## Concerns
- Full node --test remains blocked by the pre-existing unavailable DSH peer import in test-context.mjs; no peer stubs or package metadata were added.
- No documentation, CI, package metadata, or GitHub files were modified.

## Fix round 1

- bin/token-response.mjs now validates non-empty string tokens, finite positive expires_in, and rejects Date.now arithmetic overflow with a generic error.
- test/token-response.test.mjs covers valid responses, numeric/object token fields, NaN/Infinity/zero expiry, and arithmetic overflow without network access.
- REDIRECT_URI stays http://localhost:1455/auth/callback because it is the registered Codex OAuth contract while server.listen binds 127.0.0.1.

### Exact commands and output

Command: node --test test/credentials.test.mjs test/cli-syntax.test.mjs test/token-response.test.mjs; node --check credentials.js; node --check index.js; node --check bin/login.mjs; node --check bin/token-response.mjs

Output: exit 0; 10 tests passed, 0 failed; all requested syntax checks passed.

## Fix round 2

- Added explicit empty access-token and refresh-token cases and a Date.now arithmetic-overflow regression case to `test/token-response.test.mjs`.
- Confirmed `bin/token-response.mjs` rejects non-string or empty token fields, zero/NaN/Infinity expiry, and non-finite expiry arithmetic.
- Confirmed `bin/login.mjs` chmods its temporary credential file before atomic rename; REDIRECT_URI remains the registered localhost contract.

### Exact commands and output

Command: `node --test test/credentials.test.mjs test/cli-syntax.test.mjs test/token-response.test.mjs && node --check credentials.js && node --check index.js && node --check bin/login.mjs && node --check bin/token-response.mjs && git diff --check`

Output: exit 0; 10 tests passed, 0 failed; all requested syntax checks and whitespace checks passed.
