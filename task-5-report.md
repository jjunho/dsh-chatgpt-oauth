# Task 5 report

## Result

Implemented reproducible CI and supply-chain checks for the standalone package. The initial lockfile command hit the environment's pnpm database-file failure; the required workaround was used:

    pnpm install --lockfile-only
    [ERROR] unable to open database file
    For help, run: pnpm help install

    pnpm install --lockfile-only --store-dir .pnpm-store
    Done in 2.8s using pnpm v11.10.0

The generated lockfile has one importer and 105 package entries; it is not the DSH monorepo lockfile. .pnpm-store/ remains ignored by .gitignore.

## Files

- .github/workflows/ci.yml
- .github/workflows/dependency-review.yml
- .github/dependabot.yml
- pnpm-lock.yaml
- task-5-report.md

## Checks and exact output

### Frozen install

Command:

    pnpm install --frozen-lockfile --ignore-scripts --ignore-workspace --store-dir .pnpm-store

Output:

    Lockfile is up to date, resolution step is skipped
    ✓ Lockfile passes supply-chain policies (105 entries in 1.2s)
    Done in 1.6s using pnpm v11.10.0

### Syntax

Command:

    pnpm_config_store_dir=.pnpm-store pnpm run check

Output ending:

    $ node --check index.js && node --check credentials.js && node --check bin/login.mjs
    [exit code: 0]

### Tests

Command:

    pnpm_config_store_dir=.pnpm-store pnpm test

Output:

    ℹ tests 14
    ℹ pass 14
    ℹ fail 0
    ℹ skipped 0
    [exit code: 0]

### Package dry-run

Command:

    pnpm_config_store_dir=.pnpm-store pnpm pack --dry-run

Output:

    package: dsh-chatgpt-oauth@0.1.0
    Tarball Contents
    bin/login.mjs
    bin/token-response.mjs
    cordis.patch.yml
    credentials.js
    index.js
    LICENSE
    package.json
    README.md
    Tarball Details
    dsh-chatgpt-oauth-0.1.0.tgz
    [exit code: 0]

This confirms runtime files, README, and license are included while test/, .git/, credentials, and development metadata are absent.

### Secret scan

Command:

    git grep -n -I -E '(^|[^[:alnum:]_])(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,})' -- . ':!pnpm-lock.yaml'

Output:

    No credential prefixes found.
    [exit code: 0]

### Workflow YAML and structure

Commands:

    python3 -c "import yaml; [yaml.safe_load(open(f)) for f in ['.github/workflows/ci.yml','.github/workflows/dependency-review.yml','.github/dependabot.yml']]; print('valid YAML')"
    python3 -c "...assert all(Path(f).is_file() ...); ...; print('workflow structure valid')"

Output:

    valid YAML
    workflow structure valid
    [exit code: 0]

### Audit

Command:

    pnpm_config_store_dir=.pnpm-store pnpm audit --audit-level=high

Output summary:

    38 vulnerabilities found
    Severity: 3 low | 20 moderate | 15 high
    [exit code: 1]

## Concerns

- pnpm audit --audit-level=high currently fails because the resolved dependency graph contains 15 high-severity advisories, including transitive vite, js-yaml, fast-uri, brace-expansion, undici, ip-address, nanoid, and postcss findings. CI intentionally keeps this gate failing until dependencies are upgraded or advisories are otherwise resolved.
- In this checkout, pnpm discovers the enclosing DSH workspace for commands such as pnpm run; the standalone lockfile was generated with --ignore-workspace, and the package-only frozen install succeeded. A clean GitHub checkout is not nested under the monorepo.
- The default pnpm store produced unable to open database file; .pnpm-store is ignored and is the documented local workaround.
- Ruby was unavailable for YAML validation; Python PyYAML validation succeeded.
