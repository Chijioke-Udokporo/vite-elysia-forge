import { resolve } from "node:path";
import Pino from "pino";
import type { Plugin } from "vite";

const isProduction = process.env.NODE_ENV === "production";

const logger = Pino({
  name: "vite-elysia-forge",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true },
      },
});

interface ConfigOptions {
  serverURL?: string;
  serverFile?: string;
}

export function elysiaPlugin({
  serverURL = "/server/",
  serverFile = "api.ts",
}: ConfigOptions): Plugin {
  return {
    name: "vite-elysia-forge",
    async configureServer(server) {
      const apiModulePath = `${serverURL}${serverFile}`;
      const apiFile = resolve(server.config.root, apiModulePath.slice(1));

      const loadApi = async () => {
        const mod = await server.ssrLoadModule(apiModulePath);
        return mod.api as { handle: (request: Request) => Promise<Response> };
      };

      let api = await loadApi();

      server.watcher.add(apiFile);
      server.watcher.on("change", async (file) => {
        if (file !== apiFile) return;

        try {
          const mod = await server.moduleGraph.getModuleByUrl(apiModulePath);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
          }

          api = await loadApi();
          logger.info("Reloaded Elysia API module");
        } catch (error) {
          logger.error(`Failed to reload Elysia API: ${error}`);
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
          logger.error(`Elysia error: ${error}`);
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
    },
  };
}
