import { resolve } from "node:path";
import { describe, expect, it, mock } from "bun:test";
import elysiaPlugin from "../src/index";

type ApiHandler = { handle: (request: Request) => Promise<Response> };

type Watchers = Record<string, (file: string) => Promise<void> | void>;

type Middleware = (
  req: { url?: string; method?: string; headers?: Record<string, string> },
  res: {
    statusCode?: number;
    setHeader: (key: string, value: string) => void;
    end: (body?: string) => void;
  },
  next: () => void
) => Promise<void> | void;

function createDevServerMocks(root = "/tmp/app") {
  const watchers: Watchers = {};
  const middlewares: Middleware[] = [];

  const watcher = {
    add: mock(),
    on: mock((event: string, cb: (file: string) => Promise<void> | void) => {
      watchers[event] = cb;
    }),
  };

  const moduleGraph = {
    getModuleByUrl: mock(),
    invalidateModule: mock(),
  };

  const ssrLoadModule = mock();

  const server = {
    config: { root },
    watcher,
    moduleGraph,
    ssrLoadModule,
    middlewares: {
      use: mock((mw: Middleware) => {
        middlewares.push(mw);
      }),
    },
  };

  return { server, watchers, middlewares, apiFile: resolve(root, "server/api.ts") };
}

async function runMiddleware(mw: Middleware, url: string) {
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
    end(body?: string) {
      res.body = body;
    },
  };
  const next = mock();
  const req: any = { url, method: "GET", headers: { host: "example.test" } };

  await mw(req, res, next);

  return {
    status: res.statusCode,
    body: res.body,
    headers: res.headers,
    nextCalled: next.mock.calls.length,
  };
}

describe("elysiaPlugin", () => {
  it("registers middleware and watches the API module", async () => {
    const { server, watchers, middlewares, apiFile } = createDevServerMocks();

    const api: ApiHandler = {
      handle: mock(async () => new Response("ok", { status: 200 })),
    };

    server.ssrLoadModule.mockResolvedValue({ api });

    const plugin = elysiaPlugin({ serverFile: "/server/api.ts" });
    const configureServer = plugin.configureServer as typeof plugin.configureServer & ((server: any) => Promise<void>);
    await configureServer(server as any);

    expect(server.watcher.add).toHaveBeenCalledWith(apiFile);
    expect(Object.keys(watchers)).toContain("change");
    expect(middlewares).toHaveLength(1);

    expect({
      watchedFile: server.watcher.add.mock.calls[0]?.[0],
      middlewareRegistered: middlewares.length,
    }).toMatchInlineSnapshot(`
      {
        "middlewareRegistered": 1,
        "watchedFile": "/tmp/app/server/api.ts",
      }
    `);
  });

  it("reloads API module on file change and serves with the updated handler", async () => {
    const { server, watchers, middlewares, apiFile } = createDevServerMocks();

    const apiV1: ApiHandler = {
      handle: mock(
        async () =>
          new Response("v1", { status: 201, headers: { "x-api": "v1", "content-type": "text/plain;charset=UTF-8" } })
      ),
    };
    const apiV2: ApiHandler = {
      handle: mock(
        async () =>
          new Response("v2", { status: 202, headers: { "x-api": "v2", "content-type": "text/plain;charset=UTF-8" } })
      ),
    };

    server.ssrLoadModule.mockResolvedValueOnce({ api: apiV1 }).mockResolvedValueOnce({ api: apiV2 });

    server.moduleGraph.getModuleByUrl.mockResolvedValue({ id: "api-module" });

    const plugin = elysiaPlugin({ serverFile: "/server/api.ts" });
    const configureServer = plugin.configureServer as typeof plugin.configureServer & ((server: any) => Promise<void>);
    await configureServer(server as any);

    const middleware = middlewares[0]!;

    const first = await runMiddleware(middleware, "/api/ping");
    const changeHandler = watchers.change;
    expect(changeHandler).toBeDefined();
    await changeHandler?.(apiFile);
    const second = await runMiddleware(middleware, "/api/ping");

    expect(server.moduleGraph.invalidateModule).toHaveBeenCalled();
    expect(server.ssrLoadModule).toHaveBeenCalledTimes(2);

    const apiV1HandleMock = apiV1.handle as any;
    const apiV2HandleMock = apiV2.handle as any;

    expect({
      first,
      second,
      apiV1Calls: apiV1HandleMock.mock.calls.length,
      apiV2Calls: apiV2HandleMock.mock.calls.length,
    }).toMatchInlineSnapshot(`
      {
        "apiV1Calls": 1,
        "apiV2Calls": 1,
        "first": {
          "body": "v1",
          "headers": {
            "content-type": "text/plain;charset=UTF-8",
            "x-api": "v1",
          },
          "nextCalled": 0,
          "status": 201,
        },
        "second": {
          "body": "v2",
          "headers": {
            "content-type": "text/plain;charset=UTF-8",
            "x-api": "v2",
          },
          "nextCalled": 0,
          "status": 202,
        },
      }
    `);
  });

  it("passes through non-/api requests to next middleware", async () => {
    const { server, middlewares } = createDevServerMocks();

    const api: ApiHandler = {
      handle: mock(async () => new Response("ok", { status: 200 })),
    };

    server.ssrLoadModule.mockResolvedValue({ api });

    const plugin = elysiaPlugin({ serverFile: "/server/api.ts" });
    const configureServer = plugin.configureServer as typeof plugin.configureServer & ((server: any) => Promise<void>);
    await configureServer(server as any);

    const middleware = middlewares[0]!;
    const next = mock();

    const res: any = {
      statusCode: 0,
      setHeader: mock(),
      end: mock(),
    };

    const req: any = { url: "/not-api", method: "GET", headers: {} };

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(api.handle).not.toHaveBeenCalled();
  });
});
