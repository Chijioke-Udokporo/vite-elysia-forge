import { resolve, join } from "node:path";

/**
 * Options for starting the production server.
 */
export interface ProductionOptions {
  /**
   * The port to listen on.
   * @default 3000
   */
  port?: number;
  /**
   * The directory containing the built frontend assets.
   * @default "dist"
   */
  distDir?: string;
  /**
   * The name of the HTML entry file.
   * @default "index.html"
   */
  htmlFile?: string;
  /**
   * The prefix for API routes. Requests starting with this prefix will be handled by the Elysia app.
   * @default "/api"
   */
  apiPrefix?: string;
  /**
   * The Elysia app instance or an object with a `handle` method.
   */
  api: { handle: (request: Request) => Promise<Response> } | any;
}

/**
 * Starts a production server using Bun.serve.
 *
 * This function serves the static frontend assets from the distribution directory
 * and handles API requests using the provided Elysia app instance.
 *
 * @param options - Configuration options for the production server.
 * @throws {Error} If not running in a Bun environment.
 */
export const startServer = (options: ProductionOptions): void => {
  const port = options.port || 3000;
  const dist = resolve(process.cwd(), options.distDir || "dist");
  const indexHtml = join(dist, options.htmlFile || "index.html");
  const apiPrefix = options.apiPrefix || "/api";
  const api = options.api;

  if (typeof Bun === "undefined") throw new Error("This production server utility requires Bun.");

  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // 1. Handle API requests
      if (url.pathname.startsWith(apiPrefix)) {
        return api.handle(req);
      }

      // 2. Serve static files
      let path = url.pathname;
      if (path === "/") path = "/index.html";

      const filePath = join(dist, path.startsWith("/") ? path.slice(1) : path);
      const file = Bun.file(filePath);

      if (await file.exists()) return new Response(file); // Serve the static file
      if (req.method === "GET") return new Response(Bun.file(indexHtml)); // 3. SPA Fallback
      return new Response("Not Found", { status: 404 }); // 4. 404 for other methods
    },
  });

  console.log(`Production server running at http://localhost:${port}`);
};
