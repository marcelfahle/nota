# Contributing

Thanks for contributing.

## Scope

The maintained application in this repository is [`nota/`](./nota/). Most contributions should target that directory.

## Local workflow

1. Copy `nota/.env.example` to `nota/.env` and fill in safe development credentials.
2. Install dependencies in `nota/`.
3. Run migrations and seed a development owner account.
4. Start the app and verify the affected flow locally.

```bash
cd nota
bun install
bun run db:migrate
bun run db:seed
bun run dev
```

## Before opening a PR

Run the checks from `nota/`:

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
