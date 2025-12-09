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
export const api = {
  async handle(request: Request): Promise<Response> {
    return new Response("hello from elysia", { status: 200 });
  },
};
```

## Development

- Starts a Vite dev server; all `/api` requests are proxied to the loaded Elysia handler.
- File changes to the configured API module automatically invalidate and reload the module with log output.

## Testing

- Add tests under `tests/` (e.g., `tests/plugin.test.ts`) using your preferred runner (Vitest/Jest/Bun test). Include a snapshot to assert middleware wiring or log output.
- Example (Vitest):

```ts
import { describe, it, expect } from "vitest";
// import your plugin and mock a Vite dev server instance

describe("elysiaPlugin", () => {
  it("wires up /api middleware", () => {
    // ...assert middleware registration
    expect(/* serialized middleware setup */).toMatchSnapshot();
  });
});
```

Run tests:

```bash
bun test
# or: npx vitest
```

## Build

Bundle the plugin:

```bash
bun run build
# or: npx tsup
```

The build outputs ESM/CJS bundles and type definitions in `dist/`.
