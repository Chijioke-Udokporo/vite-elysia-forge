import { resolve } from "node:path";
import { describe, expect, it, mock } from "bun:test";
import elysiaPlugin from "../src/index";

type ApiHandler = { handle: (request: Request) => Promise<Response> };

type Middleware = (
  req: any,
  res: {
    statusCode?: number;
    setHeader: (key: string, value: string) => void;
    end: (body?: string) => void;
  },
  next: () => void
) => Promise<void> | void;

function createDevServerMocks(root = "/tmp/app") {
  const middlewares: Middleware[] = [];

  const server = {
    config: { root },
    watcher: {
      add: mock(),
      on: mock(),
    },
    moduleGraph: {
      getModuleByUrl: mock(),
      getModulesByFile: mock(),
      invalidateModule: mock(),
    },
    ssrLoadModule: mock(),
    middlewares: {
      use: mock((mw: Middleware) => {
        middlewares.push(mw);
      }),
    },
    httpServer: {
      once: mock(),
    },
  };

  return { server, middlewares };
}

async function runMiddlewareWithBody(mw: Middleware, url: string, method: string, bodyChunks: string[] | Buffer[]) {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
    end(body?: string) {
      res.body = body;
    },
  };
  const next = mock();

  const req: any = {
    url,
    method,
    headers: { host: "example.test" },
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of bodyChunks) {
        yield Buffer.from(chunk);
      }
    },
  };

  await mw(req, res, next);

  return {
    status: res.statusCode,
    body: res.body,
    headers: res.headers,
    nextCalled: next.mock.calls.length,
  };
}

describe("MAX_BODY_SIZE", () => {
  it("should return 413 if request body exceeds MAX_BODY_SIZE", async () => {
    const { server, middlewares } = createDevServerMocks();

    const api: ApiHandler = {
      handle: mock(async () => new Response("ok", { status: 200 })),
    };
    server.ssrLoadModule.mockResolvedValue({ api });

    // Set limit to 10 bytes
    const plugin = elysiaPlugin({
      serverFile: "/server/api.ts",
      MAX_BODY_SIZE: 10,
    });

    const configureServer = plugin.configureServer as any;
    await configureServer(server);

    const middleware = middlewares[0]!;
    expect(middleware).toBeDefined();

    // Send 11 bytes
    const result = await runMiddlewareWithBody(middleware, "/api/test", "POST", ["12345", "678901"]);

    expect(result.status).toBe(413);
    expect(result.body).toBe("Payload Too Large");
    expect(api.handle).not.toHaveBeenCalled();
  });

  it("should allow request body within MAX_BODY_SIZE", async () => {
    const { server, middlewares } = createDevServerMocks();

    const api: ApiHandler = {
      handle: mock(async (req) => {
        const text = await req.text();
        return new Response(`received: ${text}`, { status: 200 });
      }),
    };
    server.ssrLoadModule.mockResolvedValue({ api });

    // Set limit to 10 bytes
    const plugin = elysiaPlugin({
      serverFile: "/server/api.ts",
      MAX_BODY_SIZE: 10,
    });

    const configureServer = plugin.configureServer as any;
    await configureServer(server);

    const middleware = middlewares[0]!;

    // Send 10 bytes
    const result = await runMiddlewareWithBody(middleware, "/api/test", "POST", ["12345", "67890"]);

    expect(result.status).toBe(200);
    expect(result.body).toBe("received: 1234567890");
    expect(api.handle).toHaveBeenCalled();
  });

  it("should use default MAX_BODY_SIZE (1MB) if not specified", async () => {
    const { server, middlewares } = createDevServerMocks();

    const api: ApiHandler = {
      handle: mock(async () => new Response("ok", { status: 200 })),
    };
    server.ssrLoadModule.mockResolvedValue({ api });

    // No MAX_BODY_SIZE specified
    const plugin = elysiaPlugin({
      serverFile: "/server/api.ts",
    });

    const configureServer = plugin.configureServer as any;
    await configureServer(server);

    const middleware = middlewares[0]!;

    // Send 1MB + 1 byte
    const largeChunk = "a".repeat(1024 * 1024 + 1);

    const result = await runMiddlewareWithBody(middleware, "/api/test", "POST", [largeChunk]);

    expect(result.status).toBe(413);
    expect(result.body).toBe("Payload Too Large");
  });
});
