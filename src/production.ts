import { resolve, join } from "node:path";

interface ProductionOptions {
  port?: number;
  distDir?: string;
  htmlFile?: string;
  apiPrefix?: string;
  api: { handle: (request: Request) => Promise<Response> } | any;
}

export const startServer = (options: ProductionOptions) => {
  const port = options.port || 3000;
  const dist = resolve(process.cwd(), options.distDir || "dist");
  const indexHtml = join(dist, options.htmlFile || "index.html");
  const apiPrefix = options.apiPrefix || "/api";
  const api = options.api;

  if (typeof Bun === "undefined") {
    throw new Error("This production server utility requires Bun.");
  }

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

      if (await file.exists()) {
        return new Response(file);
      }

      // 3. SPA Fallback
      if (req.method === "GET") {
        return new Response(Bun.file(indexHtml));
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`Production server running at http://localhost:${port}`);
};
