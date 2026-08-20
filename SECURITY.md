# Security Policy

## Reporting a vulnerability

Use GitHub's Private vulnerability reporting for this repository. Do not open a public issue for a security problem. If private reporting is unavailable, open only a minimal issue asking maintainers to enable a private channel.

Never include OAuth access tokens, refresh tokens, credential files, authorization codes, callback URLs containing state, or unredacted logs in an issue, discussion, or pull request. Remove account identifiers and personal data from diagnostics.

## Supported versions

Only the latest release on the default branch is supported for security fixes. Upgrade before investigation of older versions.

## Local credentials

Credentials are stored under $DSH_HOME/chatgpt-oauth.json (default ~/.dsh/chatgpt-oauth.json) with owner-only permissions. Use dsh-chatgpt-login --logout if exposure is suspected, then sign in again. OpenAI controls token revocation and account access.
