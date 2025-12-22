import { resolve, relative } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import type { Plugin } from "vite";

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

  /**
   * Enable WebSocket-capable mode by running the API as a real Bun/Elysia server
   * on a separate port, and letting Vite proxy to it (including WS upgrades).
   *
   * When enabled, the plugin will:
   * - start (and hot-restart) `api.listen(backendPort)`
   * - configure Vite `server.proxy[apiPrefix]` with `ws: true`
   *
   * @default false
   */
  ws?: boolean;

  /**
   * Path prefix for API routes.
   * Used for Vite proxy configuration in `ws` mode.
   * @default "/api"
   */
  apiPrefix?: string;

  /**
   * The port to run the backend API server on in `ws` mode.
   * @default 3001
   */
  backendPort?: number;

  /**
   * Maximum allowed size for request bodies in bytes.
   * Requests exceeding this size will receive a 413 Payload Too Large response.
   * @default 1048576 (1MB)
   */
  MAX_BODY_SIZE?: number;
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
function elysiaPlugin({
  serverFile = "/server/api.ts",
  ws = false,
  apiPrefix = "/api",
  backendPort = 3001,
  MAX_BODY_SIZE = 1024 * 1024,
}: ConfigOptions = {}): Plugin {
  return {
    name: "vite-elysia-forge",
    config: ws
      ? () => ({
          server: {
            proxy: {
              [apiPrefix]: {
                target: `http://localhost:${backendPort}`,
                changeOrigin: true,
                ws: true,
              },
            },
          },
        })
      : undefined,
    async configureServer(server) {
      const apiModulePath = serverFile;
      const apiFile = resolve(server.config.root, apiModulePath.slice(1));

      const loadApi = async () => {
        const mod = await server.ssrLoadModule(apiModulePath);
        return mod.api as { handle: (request: Request) => Promise<Response> };
      };

      let api = await loadApi();

      let backendProcess: ChildProcess | null = null;
      let restarting = false;

      const startBackend = async () => {
        if (!ws) return;
        if (restarting) return;
        restarting = true;

        try {
          // Kill previous process if running
          if (backendProcess) {
            backendProcess.kill("SIGTERM");
            backendProcess = null;
          }

          // Create a temporary script file that imports the user's API and calls .listen()
          // We use a relative path from the temp script to the API file to ensure Bun resolves it correctly
          const tempDir = resolve(server.config.root, "node_modules", ".vite-elysia-forge");
          const tempScript = resolve(tempDir, "dev-server.ts");
          const absoluteApiFile = resolve(
            server.config.root,
            apiModulePath.startsWith("/") ? apiModulePath.slice(1) : apiModulePath
          );

          // Calculate relative path from tempScript to absoluteApiFile
          // We need to handle Windows paths correctly if necessary, but for now standard relative is fine
          // We also need to ensure it starts with ./ or ../
          let relativeApiImport = relative(tempDir, absoluteApiFile);
          if (!relativeApiImport.startsWith(".")) {
            relativeApiImport = "./" + relativeApiImport;
          }

          if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true });
          }

          const scriptContent = `import { api } from ${JSON.stringify(relativeApiImport)};
api.listen(${backendPort});
console.log("WebSocket server running at ws://localhost:${backendPort}");
`;
          writeFileSync(tempScript, scriptContent);

          // Spawn bun to run the temp script file
          backendProcess = spawn("bun", ["run", tempScript], {
            stdio: ["ignore", "inherit", "inherit"],
            cwd: server.config.root,
            env: { ...process.env },
          });

          backendProcess.on("error", (err) => {
            console.error(`Failed to start API server: ${err.message}`);
          });

          backendProcess.on("exit", (code) => {
            if (code !== null && code !== 0) {
              console.error(`API server process exited with code ${code}`);
            }
            backendProcess = null;
          });
        } finally {
          restarting = false;
        }
      };

      if (ws) {
        await startBackend();

        server.httpServer?.once("close", () => {
          if (backendProcess) {
            backendProcess.kill("SIGTERM");
            backendProcess = null;
          }
        });
      }

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
          console.log("Reloaded Elysia API module");

          if (ws) {
            await startBackend();
          }
        } catch (error) {
          console.error(`Failed to reload Elysia API: ${error}`);
        }
      });

      if (ws) return;

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
          let body: Buffer | undefined;
          if (req.method !== "GET" && req.method !== "HEAD") {
            const chunks: Buffer[] = [];
            let totalSize = 0;

            for await (const chunk of req) {
              totalSize += chunk.length;
              if (totalSize > MAX_BODY_SIZE) {
                res.statusCode = 413;
                res.end("Payload Too Large");
                return;
              }
              chunks.push(chunk);
            }
            body = Buffer.concat(chunks);
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
          console.error(`Elysia error: ${error}`);
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
    },
  };
}

export default elysiaPlugin;
