# @nota-app/sdk

TypeScript client for Nota's REST API.

## Install

```bash
bun add @nota-app/sdk
```

## Usage

```ts
import { createNotaClient } from "@nota-app/sdk";

const client = createNotaClient("https://nota.example.com", process.env.NOTA_API_KEY!);
const me = await client.getMe();
console.log(me.org.name);
```
