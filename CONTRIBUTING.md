# Contributing

Use GitHub Discussions for questions and design conversations, and GitHub Issues for actionable bugs and feature requests.

## Development

1. Install Node.js 22.19 or newer and pnpm.
2. Run pnpm install.
3. Run pnpm run check and pnpm test.
4. Run pnpm pack:check when changing package contents.

Tests must use synthetic credentials and must not perform live OAuth or network requests. Never commit the DSH credential file, tokens, callback state, or private logs.

## Pull requests

Keep changes focused, explain user impact, include tests for runtime changes, and update docs for behavior or compatibility changes. Complete the pull-request checklist and sanitize logs. Confirm that no credential was included.
