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

Place your Elysia handler at `server/api.ts` (default path):

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
      serverFile: "./server/api.ts",
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
  serverFile: "./server/api.ts",
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

In production, the built server (`build/server.js` or the compiled binary) runs your Elysia app directly with full WebSocket support—no proxy needed.

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
  }),
);
```

## 7. Production Deployment

The CLI provides a `build` command for building your Elysia API server. Frontend assets should be built separately using Vite's standard build process (`vite build`).

By default, the CLI looks for your API at `server/api.ts`. You can specify a custom path with the `--entry` flag.

### 7.1 Frontend Build

Build your frontend using Vite directly:

```bash
vite build
```

**Output:**

```
dist/
├── index.html
└── assets/
```

Deploy to any static host (Cloudflare Pages, Netlify, Vercel, etc.)

### 7.2 Server Build (`--outDir`)

Build the Elysia API server into a standalone JavaScript bundle.

```bash
vite-elysia-forge build --outDir dist
```

**What it does:**

1. Generates a production entry file that imports your API
2. Bundles the server into `dist/server.js`

**package.json:**

```json
{
  "scripts": {
    "build:server": "vite-elysia-forge build --outDir dist",
    "start": "bun dist/server.js"
  }
}
```

**With custom entry and target:**

```bash
vite-elysia-forge build --entry src/my-api.ts --outDir .output --target node
```

### 7.3 Compiled Binary (`--outFile`)

Build and compile the server into a **standalone executable** (no Bun runtime required).

```bash
vite-elysia-forge build --outFile server
```

**What it does:**

1. Bundles the server code
2. Compiles into a native binary at the specified path

**package.json:**

```json
{
  "scripts": {
    "build:server": "vite-elysia-forge build --outFile dist/server",
    "start": "./dist/server"
  }
}
```

### 7.4 CLI Reference

**Command:**

```bash
vite-elysia-forge build [options]
```

**Options:**

| Option              | Short | Default         | Description                                |
| :------------------ | :---: | :-------------- | :----------------------------------------- |
| `--entry <path>`    | `-e`  | `server/api.ts` | Path to API entry file                     |
| `--outDir <dir>`    | `-d`  | `dist`          | Output directory for bundled `server.js`   |
| `--outFile <file>`  | `-o`  | —               | Output path for compiled standalone binary |
| `--target <target>` | `-t`  | `bun`           | Build target: `bun`, `node`, or `browser`  |
| `--no-minify`       |   —   | —               | Disable minification                       |

> **Note:** `--outDir` and `--outFile` are mutually exclusive. Use `--outDir` for a bundled JS file, or `--outFile` for a compiled binary.

**Examples:**

```bash
# Bundle server to dist/server.js
vite-elysia-forge build --outDir dist

# Bundle with node target
vite-elysia-forge build --outDir build--target node

# Compile to standalone binary
vite-elysia-forge build --outFile server

# Compile with custom entry
vite-elysia-forge build --entry src/api/index.ts --outFile myserver

# Bundle without minification
vite-elysia-forge build --outDir build--no-minify
```

### 7.5 Deployment Architecture

**Separate deployment (recommended):**

```
┌─────────────────┐         ┌──────────────────┐
│  Static Host    │         │   API Server     │
│  (CDN/Pages)    │◄────────┤   (VPS/Cloud)    │
│                 │  CORS   │                  │
│  dist/          │         │  dist/server.js  │
└─────────────────┘         └──────────────────┘
```

- Frontend: Build with `vite build` and deploy to Cloudflare Pages, Netlify, Vercel, etc.
- Backend: Build with `vite-elysia-forge build --outDir dist` and deploy to any server with Bun installed, or use the compiled binary

**API-only deployment:**

If you have no frontend, just build and deploy the server:

```bash
vite-elysia-forge build --outDir dist
bun dist/server.js
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
  serverFile: "./server/api.ts",
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
