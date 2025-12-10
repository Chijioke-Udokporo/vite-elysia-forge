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
})
```

### 3.2 Using Bun APIs & Caveats

To use Bun-specific APIs (like `Bun.file`, `Bun.env`, `bun:sqlite`) in your server code, you must run Vite using the Bun runtime:

```bash
bunx --bun vite
```

**Caveats:**
- **Node.js Compatibility:** While Bun has excellent Node.js compatibility, some Vite plugins that rely on obscure Node.js internals might behave unexpectedly.
- **Performance:** Running Vite under Bun is generally faster, but you might encounter edge cases where optimization differs from Node.js.

## 4. API Module Requirements

Your API module must export an Elysia instance with a `handle(request: Request) => Promise<Response>` method.

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

## 5. Integration with @elysiajs/openapi

To use the [@elysiajs/openapi plugin](https://elysiajs.com/patterns/openapi), add the following to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["bun-types"],
    "typeRoots": ["node_modules"]
  }
}
```

### 5.1 Example with `fromTypes`

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

## 6. Production Deployment

### 6.1 Build Configuration

Update your `package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite-elysia-forge build",
    "start": "bun dist/server.js"
  }
}
```

If your API is located elsewhere, specify the path:

```bash
vite-elysia-forge build src/my-api.ts
```

### 6.2 Building for Production

Run the build command:

```bash
bun run build
```

This command performs the following steps:

1. Runs `vite build` to compile your frontend to `dist/`
2. Automatically generates a temporary entry file that imports your API from `src/server/api.ts`
3. Bundles the server into a single file at `dist/server.js`

### 6.3 Starting the Production Server

Start the server with:

```bash
bun start
```

## 7. Troubleshooting

### 7.1 "Bun is not defined" Error

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

### 7.2 Hot Reload Not Working

Check that your file changes are within the dependency graph of your API module. The plugin uses Vite's dependency tracking to determine when to reload.

## 8. Authors

- Chijioke Udokporo ([@chijiokeudokporo](https://github.com/chijioke-udokporo))

## 9. License

MIT
