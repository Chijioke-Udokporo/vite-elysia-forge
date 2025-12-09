import { defineConfig } from "tsup";

export default defineConfig([
  // Main Vite plugin (both CJS and ESM for compatibility)
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: false,
    treeshake: true,
    splitting: false,
    minify: true,
  },
  // Production server and CLI (ESM only, Bun-specific)
  {
    entry: ["src/production.ts", "src/cli.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: false,
    treeshake: true,
    splitting: false,
    minify: true,
  },
]);
