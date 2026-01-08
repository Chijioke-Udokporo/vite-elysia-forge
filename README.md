# vite-elysia-forge

<p align="center">
  <img src="https://vitejs.dev/logo.svg" alt="Vite" width="60" height="60" />
  <img src="https://elysiajs.com/assets/elysia.svg" alt="Elysia" width="60" height="60" />
  <img src="https://bun.sh/logo.svg" alt="Bun" width="60" height="60" />
</p>

A [Vite](https://vite.dev/) middleware plugin that hot-reloads an [Elysia](https://elysiajs.com/) API module and forwards `/api` requests to it during local development. Powered by [Bun](https://bun.sh/).

## 1. Installation

```bash
bun install vite-elysia-forge
```

## 2. Quick Start

### 2.1 Create Your API Handler

Place your Elysia handler at `src/server/api.ts` (default path):

```ts
import { Elysia } from "elysia";

export const api = new Elysia({
  prefix: "/api",
});

api.get("/", () => "hello from elysia");

export default api;
```

### 2.2 Configure Vite

Register the plugin in your Vite config:

```ts
import { defineConfig } from "vite";
import elysiaPlugin from "vite-elysia-forge";

export default defineConfig({
  plugins: [
    elysiaPlugin({
      serverFile: "./src/server/api.ts",
    }),
  ],
});
```

### 2.3 Start Development

Run Vite as usual and access your API at `/api/*` routes. The plugin will automatically reload the Elysia module when files change.

```bash
bun run dev
```

## 3. Configuration Options

### 3.1 Plugin Options

You can configure the plugin by passing an object with the following options:

| Option Key      | Required | Default            | Description                                                            |
| :-------------- | :------: | :----------------- | :--------------------------------------------------------------------- |
| `serverFile`    |    No    | `"/server/api.ts"` | Path to your Elysia API module (relative to project root).             |
| `ws`            |    No    | `false`            | Enable WebSocket support. Runs API as a separate process + Vite proxy. |
| `apiPrefix`     |    No    | `"/api"`           | Path prefix for API routes. Used for proxying in `ws` mode.            |
| `backendPort`   |    No    | `3001`             | Port for the backend API server in `ws` mode.                          |
| `MAX_BODY_SIZE` |    No    | `1048576` (1MB)    | Maximum allowed size for request bodies in bytes.                      |

```ts
elysiaPlugin({
  serverFile: "/server/api.ts",
  ws: true,
  apiPrefix: "/api",
  backendPort: 3001,
  MAX_BODY_SIZE: 1024 * 1024, // 1MB
});
```

## 4. API Module Requirements

Your API module must export an Elysia instance as `api`.

### 4.1 Basic Example

```ts
import { Elysia } from "elysia";

export const api = new Elysia({
  prefix: "/api",
});

api.get("/", () => "hello from elysia");
api.get("/users", () => ["user1", "user2"]);

export default api;
```

### 4.2 WebSocket Example

```ts
import { Elysia } from "elysia";

export const api = new Elysia({
  prefix: "/api",
})
  .get("/", () => "hello from elysia")
  .ws("/ws", {
    message(ws, message) {
      ws.send(`Echo: ${message}`);
    },
  });

export default api;
```

## 5. WebSocket Support

By default, the plugin runs your API as middleware inside Vite's dev server. This works great for HTTP routes but **does not support WebSockets** (Elysia's `.ws()` routes).

To enable WebSocket support, set `ws: true`:

```ts
elysiaPlugin({
  serverFile: "./src/server/api.ts",
  ws: true, // Enable WebSocket support
  backendPort: 3001, // API runs on this port (default: 3001)
});
```

### 5.1 How WS Mode Works

When `ws: true`:

1. The plugin spawns a **separate Bun process** that runs your API with `api.listen(backendPort)`.
2. Vite is configured to **proxy** `/api` requests (including WebSocket upgrades) to that backend.
3. On file changes, the backend process is **automatically restarted**.

This ensures full Bun runtime support for WebSockets, even if Vite itself runs under Node.js.

### 5.2 Production

In production, the built server (`dist/server.js` or the compiled binary) runs your Elysia app directly with full WebSocket support—no proxy needed.

## 6. Integration with @elysiajs/openapi

To use the [@elysiajs/openapi plugin](https://elysiajs.com/patterns/openapi), add the following to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["bun-types"],
    "typeRoots": ["node_modules"]
  }
}
```

### 6.1 Example with `fromTypes`

It is recommended to pre-generate the declaration file (`.d.ts`) to provide type declaration to the generator.

```ts
import { Elysia, t } from "elysia";
import { openapi, fromTypes } from "@elysiajs/openapi";

const app = new Elysia().use(
  openapi({
    references: fromTypes("server/api"),
  })
);
```

## 7. Production Deployment

The CLI provides several build commands to bundle your frontend and Elysia backend for production.

### 7.1 Standard Build (`build`)

Builds the frontend with Vite and bundles the Elysia server into a single JavaScript file.

```bash
vite-elysia-forge build
```

**What it does:**

1. Runs `vite build` to compile your frontend to `dist/`
2. Generates a production entry file that imports your API
3. Bundles the server into `dist/server.js`

**package.json:**

```json
{
  "scripts": {
    "build": "vite-elysia-forge build",
    "start": "bun dist/server.js"
  }
}
```

### 7.2 Compiled Binary (`build-compile`)

Builds everything and compiles the server into a **standalone executable** (no Bun runtime required on the target machine).

```bash
vite-elysia-forge build-compile
```

**What it does:**

1. Performs the standard build
2. Compiles `dist/server.js` into a native binary at `dist/server`

**package.json:**

```json
{
  "scripts": {
    "build": "vite-elysia-forge build-compile",
    "start": "./dist/server"
  }
}
```

### 7.3 Separate Outputs (`--static` / `--server`)

Build the frontend and backend to **separate directories** for independent deployment (e.g., static assets to a CDN, server to a VPS).

```bash
vite-elysia-forge build --static dist --server .output
```

**Output structure:**

```
project/
├── dist/           # Static assets (deploy to CDN)
│   ├── index.html
│   └── assets/
└── .output/        # Server bundle (deploy to server)
    └── server.js
```

**Use cases:**

- Deploying static assets to Cloudflare Pages, Netlify, Vercel, etc.
- Running the Elysia server on a separate VPS or Docker container
- CI/CD pipelines that deploy frontend and backend independently

**package.json:**

```json
{
  "scripts": {
    "build": "vite-elysia-forge build --static dist --server .output",
    "start": "bun .output/server.js"
  }
}
```

Override the static assets path at runtime:

```bash
STATIC_DIR=/path/to/static bun .output/server.js
```

### 7.4 Frontend Only (`build-static`)

Build only the frontend, skipping the server bundle.

```bash
vite-elysia-forge build-static
```

Useful for rebuilding just the frontend without touching the server.

### 7.5 Server Only (`build-server`)

Build only the server bundle, skipping the Vite frontend build.

```bash
vite-elysia-forge build-server --server .output --static dist
```

Useful when the frontend is already built or deployed separately.

### 7.6 CLI Reference

| Option           | Short | Default             | Description                                 |
| :--------------- | :---: | :------------------ | :------------------------------------------ |
| `--api <path>`   | `-a`  | `src/server/api.ts` | Path to API entry file                      |
| `--static <dir>` | `-s`  | `dist`              | Output directory for static frontend assets |
| `--server <dir>` | `-o`  | Same as `--static`  | Output directory for server bundle          |
| `--skip-vite`    |       | `false`             | Skip the Vite frontend build                |
| `--skip-server`  |       | `false`             | Skip the server build                       |

**Example with custom API path:**

```bash
vite-elysia-forge build --api src/my-api.ts
```

## 8. Troubleshooting

### 8.1 "Bun is not defined" Error

If you encounter this error, ensure you are running Vite with the Bun runtime:

```bash
bunx --bun vite
```

Or update your `dev` script in `package.json`:

```json
"scripts": {
  "dev": "bunx --bun vite"
}
```

**Benefits:**

- **Access to Bun APIs:** You can use `Bun.file`, `Bun.env`, `bun:sqlite`, and other native Bun features directly in your server code.
- **Performance:** Vite often starts faster and uses less memory when running under Bun.

**Caveats:**

- **Node.js Compatibility:** While Bun has excellent Node.js compatibility, some Vite plugins that rely on obscure Node.js internals might behave unexpectedly.
- **Performance:** Running Vite under Bun is generally faster, but you might encounter edge cases where optimization differs from Node.js.

### 8.2 Hot Reload Not Working

Check that your file changes are within the dependency graph of your API module. The plugin uses Vite's dependency tracking to determine when to reload.

### 8.3 WebSocket "adapter doesn't support" Error

If you see `Current adapter doesn't support WebSocket`, you need to enable WS mode:

```ts
elysiaPlugin({
  serverFile: "./src/server/api.ts",
  ws: true,
});
```

This spawns your API as a separate Bun process with full WebSocket support.

### 8.4 "ReferenceError: process is not defined" with OpenAPI

If you use `@elysiajs/openapi` with `fromTypes` and see this error in the browser console:

\`\`\`
Uncaught ReferenceError: process is not defined
at fromTypes ...
\`\`\`

This happens because \`fromTypes\` relies on Node.js/Bun APIs that don't exist in the browser. It usually means you are importing your server file as a value in client-side code.

**Solution:** Use \`import type\` when importing your API instance for Eden Treaty.

\`\`\`ts
// ❌ Incorrect
import { api } from './server/api'
const client = treaty(api)

// ✅ Correct
import type { api } from './server/api'
const client = treaty<typeof api>('localhost:3000')
\`\`\`

## 9. Authors

- Chijioke Udokporo ([@chijiokeudokporo](https://github.com/chijioke-udokporo))

## 10. License

MIT
