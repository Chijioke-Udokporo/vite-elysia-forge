import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/production.ts", "src/cli.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["pino", "pino-pretty"],
  treeshake: true,
  splitting: false,
  minify: true,
});
