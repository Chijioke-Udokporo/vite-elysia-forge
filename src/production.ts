import { resolve, join } from "node:path";
import { Elysia } from "elysia";

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

  const app = new Elysia();

  // Mount user's Elysia app (including WS routes)
  if (api) app.use(api);

  // Static + SPA fallback (kept outside /api)
  app.all("/*", async ({ request, set }) => {
    const url = new URL(request.url);

    // If it looks like an API request but no API route matched, return 404
    if (url.pathname.startsWith(apiPrefix)) {
      set.status = 404;
      return "Not Found";
    }

    let path = url.pathname;
    if (path === "/") path = "/index.html";

    const filePath = join(dist, path.startsWith("/") ? path.slice(1) : path);

    // Security check: prevent path traversal
    if (!filePath.startsWith(dist)) {
      set.status = 403;
      return "Forbidden";
    }

    const file = Bun.file(filePath);

    if (await file.exists()) return file;
    if (request.method === "GET") return Bun.file(indexHtml);

    set.status = 404;
    return "Not Found";
  });

  app.listen(port);

  console.log(`Production server running at http://localhost:${port}`);
};
