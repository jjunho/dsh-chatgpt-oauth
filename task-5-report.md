# Task 5 report

## Result

Hardened the standalone OSS release gates. The package boundary is now checked from pnpm's JSON dry-run output, secret scanning fails closed, and production auditing is separate from the informational development audit.

## Changes

- Added `scripts/check-pack.mjs`; it runs `pnpm pack --dry-run --json` with the project-local store when no store is configured, requires exactly the eight published files, and rejects tests, Git metadata, credential files, reports, and development metadata.
- Changed `package.json` `pack:check` to run the checker.
- CI scans all tracked files, including `pnpm-lock.yaml`. Git grep status 1 means no match; status 0 (match) and every fatal status fail the step.
- CI blocks on `pnpm audit --prod --audit-level=high`; the full development graph audit runs separately as informational.
- Kept exactly one standalone lockfile, one CI workflow, one dependency-review workflow, one Dependabot file, and no duplicate dependency-review files.

## Checks

- `PNPM_CONFIG_STORE_DIR=.pnpm-store pnpm install --frozen-lockfile --ignore-scripts --ignore-workspace` — passed.
- `PNPM_CONFIG_STORE_DIR=.pnpm-store pnpm run check` — passed.
- `PNPM_CONFIG_STORE_DIR=.pnpm-store pnpm test` — passed: 14/14.
- `PNPM_CONFIG_STORE_DIR=.pnpm-store pnpm pack:check` — passed: exactly 8 files.
- Secret scan over all tracked files — passed with no matches; `pnpm-lock.yaml` was included.
- `PNPM_CONFIG_STORE_DIR=.pnpm-store pnpm audit --prod --audit-level=high --ignore-workspace` — passed: no known vulnerabilities.
- Full development audit — informational. The enclosing DSH development graph reports 15 high advisories (including brace-expansion, js-yaml, fast-uri, undici, ip-address, nanoid, and postcss). They are transitive development/test/tooling dependencies and are not production dependencies or packed runtime files, so they do not weaken the production gate. The standalone package-only audit currently reports no known vulnerabilities.
- Python PyYAML validation of both workflows and Dependabot — passed.
- `git diff --check` — passed.

## Commit

Commit: `75eca6c829648adf54e1b70f63fdb90e89d341a7 ci: harden OSS release gates`.

## Concerns

- Running pnpm from this nested worktree can discover the enclosing DSH workspace; local package-only checks therefore use `--ignore-workspace` where supported and the project-local store. A clean GitHub checkout is not nested under that workspace.
- The development audit remains informational by design; its 15 high advisories should be tracked and upgraded separately.
