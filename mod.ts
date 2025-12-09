/**
 * @module
 *
 * This module provides the main integration for Vite and Elysia, allowing you to run an Elysia server
 * within the Vite development server and build it for production.
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import elysiaPlugin from "@codesordinate/vite-elysia-forge";
 *
 * export default defineConfig({
 *   plugins: [
 *     elysiaPlugin({
 *       serverFile: "/server/api.ts",
 *     }),
 *   ],
 * });
 * ```
 */
export { default, type ConfigOptions } from "./src/index.ts";
export * from "./src/production.ts";
