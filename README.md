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

```ts
elysiaPlugin({
  // Path to your Elysia API module (relative to project root)
  serverFile?: string; // default: "/server/api.ts"

  // Enable WebSocket support (runs API as a separate process + Vite proxy)
  ws?: boolean; // default: false

  // Path prefix for API routes (used for proxying in WS mode)
  apiPrefix?: string; // default: "/api"

  // Port for the backend API server in WS mode
  backendPort?: number; // default: 3001
})
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

### 7.1 Build Configuration

Update your `package.json` scripts:

Pick **one** build mode.

Option A: build to `dist/server.js` (run with Bun):

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite-elysia-forge build",
    "start": "bun dist/server.js"
  }
}
```

Option B: build + compile to a standalone binary `dist/server`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite-elysia-forge build-compile",
    "start": "./dist/server"
  }
}
```

If your API is located elsewhere, specify the path:

```bash
vite-elysia-forge build src/my-api.ts
```

### 7.2 Building for Production

Run the build command:

```bash
bun run build
```

This command performs the following steps:

1. Runs `vite build` to compile your frontend to `dist/`
2. Automatically generates a temporary entry file that imports your API from `src/server/api.ts`
3. Bundles the server into a single file at `dist/server.js`

### 7.3 Building a Standalone Binary

If you want a single executable (no Bun runtime required on the target machine), set your `build` script to `vite-elysia-forge build-compile` (Option B above) and run:

```bash
bun run build
```

This runs the normal build and then compiles `dist/server.js` into a standalone binary at `dist/server`.

### 7.4 Starting the Production Server

Start the server with:

```bash
bun start
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

## 9. Authors

- Chijioke Udokporo ([@chijiokeudokporo](https://github.com/chijioke-udokporo))

## 10. License

MIT
