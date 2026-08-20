# Task 3 implementation report

## Status

DONE_WITH_CONCERNS

## Scope

- Added permanent public-boundary regression tests for model metadata and adapter authentication.
- Removed the temporary root-level context test.
- Added exact compatibility-floor development dependencies so the public package test suite can resolve its runtime peers after installation.
- No live network or OAuth calls were added.
- Existing token-response tests were preserved.

## Files changed

- `test/model-metadata.test.mjs`: exercises `apply(ctx)` with a fake LLM registry and verifies the four 1,050,000-token context overrides plus the unchanged 272,000-token `gpt-5.4` metadata.
- `test/adapter-auth.test.mjs`: exercises missing and synthetic credentials through the registered adapter; the missing case proves no fetch occurs, and the valid case stubs fetch and verifies the bearer token reaches only the stubbed provider request.
- `package.json`: adds exact devDependencies at the existing peer compatibility floor.
- `test-context.mjs`: removed after porting its regression coverage.
- `task-3-report.md`: this report.

## Commit

- `c737ee8 test: align adapter stream assertions`.

## Commands and outputs

- `node --test test/package-metadata.test.mjs test/credentials.test.mjs test/cli-syntax.test.mjs test/token-response.test.mjs`: passed; 11 tests, 0 failures.
- `node --check index.js && node --check credentials.js && node --check bin/login.mjs && node --check bin/token-response.mjs && node --check test/model-metadata.test.mjs && node --check test/adapter-auth.test.mjs && git diff --check`: passed; exit code 0.
- `pnpm test`: could not start; pnpm reported `[ERROR] unable to open database file`.
- `pnpm run check`: could not start for the same pnpm database error.
- `node --test test/model-metadata.test.mjs test/adapter-auth.test.mjs`: could not run because this isolated worktree has no installed `@deepseek-ai/dsh-llm-pi-ai` peer package.

## Concerns

The two new public-boundary tests require the exact devDependencies declared in `package.json`; installation was unavailable in this isolated worktree, so their runtime assertions could not be executed locally. The requested pnpm commands were also blocked before test execution by pnpm's unavailable database file. No lockfile was present in the worktree, so none was created; lockfile publication remains outside Task 3 scope.

## Fix round

- Corrected the implementation commit reference to actual HEAD `e6fdc9e`.
- Updated adapter authentication tests to consume terminal finish chunks, verify `MISSING_CREDENTIAL` and no fetch for missing credentials, verify the synthetic JWT reaches the stubbed provider as a Bearer token, and verify token absence from logger/stdout/stderr captures.
- Fix-round verification used a temporary ignored `node_modules` symlink, removed after testing: focused metadata/auth tests passed (3/3), full plugin suite passed (14/14), syntax checks and `git diff --check` passed. No live OAuth or network calls were used.

## Fix-round note

- Fix round completed in `c737ee8`; this commit is the current provenance for the adapter stream assertion fix.
