# vite-elysia-forge

<svg width="200" height="120" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
  <!-- Vite logo representation -->
  <defs>
    <linearGradient id="viteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#646cff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#535bf2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Vite symbol -->
  <polygon points="50,20 70,60 50,100 30,60" fill="url(#viteGradient)" />
  
  <!-- Arrow connecting to Elysia -->
  <line x1="80" y1="60" x2="120" y2="60" stroke="#646cff" stroke-width="3" marker-end="url(#arrowhead)" />
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="#646cff" />
    </marker>
  </defs>
  
  <!-- Elysia symbol (simplified) -->
  <circle cx="150" cy="30" r="15" fill="#e0db55" />
  <circle cx="150" cy="90" r="15" fill="#e0db55" />
  <rect x="135" y="50" width="30" height="20" fill="#e0db55" />
</svg>

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

## Starting the App

To build and start the app:

```bash
bun run build
bun start
```

`bun run build` compiles the plugin for production, and `bun start` runs the built application.

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

## Production Usage

When building for production, you need to build both the Vite frontend and the Elysia backend. This package provides a CLI to handle this for you.

1. Update your `package.json` build script:

```json
{
  "scripts": {
    "build": "vite-elysia-forge build",
    "start": "bun dist/server.js"
  }
}
```

2. Run the build:

```bash
bun run build
```

This will:

1. Run `vite build` to compile your frontend to `dist/`.
2. Automatically generate a temporary entry file that imports your API from `src/server/api.ts` (default).
3. Bundle the server into a single file at `dist/server.js`.

If your API is located elsewhere, you can specify the path:

```bash
vite-elysia-forge build src/my-api.ts
```

3. Start the server:

```bash
bun start
```

## Authors

- Chijioke Udokporo ([@chijiokeudokporo](https://github.com/chijioke-udokporo))
