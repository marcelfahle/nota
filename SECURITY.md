# Security Policy

## Reporting a vulnerability

Do not open a public issue for security-sensitive reports.

Use [GitHub private vulnerability reporting](https://github.com/marcelfahle/nota/security/advisories/new)
or email hello@withnota.com with:

- a clear description of the issue
- affected files or routes
- reproduction steps
- impact assessment
- any suggested remediation

## What to expect

- An acknowledgement within three business days.
- An assessment and, for confirmed issues, a fix plan within fourteen days.
- A coordinated disclosure once the fix is deployed to the hosted app and released to npm.
  We credit reporters who want to be named.

## Supported versions

Nota is deployed continuously from `main`. Only `main`, the hosted app at app.withnota.com, and the
latest published versions of `@nota-app/cli`, `@nota-app/mcp` and `@nota-app/sdk` receive security
fixes. Self-hosted installs should track `main`.

## Scope

Security-sensitive areas in this repository include:

- authentication, sessions, OAuth and API keys
- authorization and workspace isolation
- invoice numbering and audit events
- Stripe webhook processing
- email delivery and reset-token flows
- environment variable and secret handling
- the MCP servers and the OAuth state they store

Reasonable disclosure time and a coordinated fix are preferred before public discussion.
