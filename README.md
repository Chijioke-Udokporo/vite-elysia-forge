# vite-elysia-forge

Vite middleware plugin that hot-reloads an Elysia API module and forwards `/api` requests to it during local development.

## Installation

```bash
bun install
```

## Quick Start

1. Place your Elysia handler at `src/server/api.ts` (default path).
2. In your Vite config, register the plugin:

```ts
import { defineConfig } from "vite";
import { elysiaPlugin } from "vite-elysia-forge";

export default defineConfig({
  plugins: [
    elysiaPlugin({
      serverURL: "/server/",
      serverFile: "api.ts",
    }),
  ],
});
```

3. Run Vite as usual, and hit `/api/*` routes. The plugin will reload the Elysia module when the file changes.

## Configuration

| Option       | Type   | Default      | Description                                             |
| ------------ | ------ | ------------ | ------------------------------------------------------- |
| `serverURL`  | string | `"/server/"` | URL prefix to your API module (leading slash required). |
| `serverFile` | string | `"api.ts"`   | Filename of the Elysia module to load and hot-reload.   |

## Expectations for the API module

Your API module should export `api` with a `handle(request: Request) => Promise<Response>` signature.

```ts
export const api = new Elysia({
  prefix: "/api",
});

api.get("/", () => "hello from elysia");

export default api;
```
