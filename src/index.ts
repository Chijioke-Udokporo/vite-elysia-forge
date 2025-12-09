import { resolve } from "node:path";
import type { Plugin, ModuleNode } from "vite";

/**
 * Configuration options for the Vite Elysia Forge plugin.
 */
export interface ConfigOptions {
  /**
   * The URL path to the server API module.
   * This file should export the Elysia app instance as `api`.
   * @default "/server/api.ts"
   */
  serverFile?: string;
}

/**
 * A Vite plugin that integrates ElysiaJS into the Vite development server.
 *
 * This plugin allows you to run your Elysia backend alongside your frontend code
 * in the same Vite dev server, enabling seamless full-stack development.
 *
 * @param options - Configuration options for the plugin.
 * @returns A Vite plugin instance.
 */
function elysiaPlugin({ serverFile = "/server/api.ts" }: ConfigOptions): Plugin {
  return {
    name: "vite-elysia-forge",
    async configureServer(server) {
      const apiModulePath = serverFile;
      const apiFile = resolve(server.config.root, apiModulePath.slice(1));

      const loadApi = async () => {
        const mod = await server.ssrLoadModule(apiModulePath);
        return mod.api as { handle: (request: Request) => Promise<Response> };
      };

      let api = await loadApi();

      server.watcher.add(apiFile);
      server.watcher.on("change", async (file) => {
        const entryMod = await server.moduleGraph.getModuleByUrl(apiModulePath);
        if (!entryMod) return;

        const changedMods = server.moduleGraph.getModulesByFile(file);
        if (!changedMods || changedMods.size === 0) return;

        let isDependency = false;
        const seen = new Set<string>();
        const queue = [...changedMods];

        while (queue.length > 0) {
          const node = queue.shift();
          if (!node || !node.id || seen.has(node.id)) continue;
          seen.add(node.id);

          if (node.id === entryMod.id) {
            isDependency = true;
            break;
          }

          for (const importer of node.importers) {
            queue.push(importer);
          }
        }

        if (!isDependency) return;

        try {
          server.moduleGraph.invalidateModule(entryMod);
          api = await loadApi();
          console.log("[vite-elysia-forge] Reloaded Elysia API module");
        } catch (error) {
          console.error(`[vite-elysia-forge] Failed to reload Elysia API: ${error}`);
        }
      });

      server.middlewares.use(async (req, res, next) => {
        // Only handle /api routes
        if (!req.url?.startsWith("/api")) {
          return next();
        }

        try {
          // Build the full URL
          const protocol = "http";
          const host = req.headers.host || "localhost:3000";
          const url = `${protocol}://${host}${req.url}`;

          // Collect body for non-GET requests
          let body: string | undefined;
          if (req.method !== "GET" && req.method !== "HEAD") {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            body = Buffer.concat(chunks).toString();
          }

          // Create a Request object for Elysia
          const request = new Request(url, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: body,
          });

          // Handle with Elysia
          const response = await api.handle(request);

          // Send response
          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) => {
            res.setHeader(key, value);
          });

          const responseBody = await response.text();
          res.end(responseBody);
        } catch (error) {
          console.error(`[vite-elysia-forge] Elysia error: ${error}`);
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
    },
  };
}

export default elysiaPlugin;
