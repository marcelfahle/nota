# Contributing

Thanks for contributing.

## Scope

The maintained application in this repository is [`inv/`](./inv/). Most contributions should target that directory.

## Local workflow

1. Copy `inv/.env.example` to `inv/.env` and fill in safe development credentials.
2. Install dependencies in `inv/`.
3. Run migrations and seed a development owner account.
4. Start the app and verify the affected flow locally.

```bash
cd inv
bun install
bun run db:migrate
bun run db:seed
bun run dev
```

## Before opening a PR

Run the checks from `inv/`:

```bash
bun test
bun run check
bun run build
```

If you touched browser flows, also run:

```bash
bunx playwright install chromium
bun run test:e2e
```

## Guidelines

- Keep the app intentionally single-owner unless the change explicitly expands scope.
- Do not commit secrets or real `.env` files.
- Prefer small, reviewable pull requests with a clear problem statement.
- Update docs and runbooks when behavior or deployment requirements change.
