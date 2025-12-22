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

async function runMiddlewareWithBody(mw: Middleware, url: string, method: string, bodyChunks: Buffer[]) {
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
        yield chunk;
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

describe("Binary Upload", () => {
  it("should preserve binary data integrity during upload", async () => {
    const { server, middlewares } = createDevServerMocks();

    // Create a binary buffer that is NOT valid UTF-8
    // 0xD3 0xEB 0xE9 0xE1 (from the issue description)
    const binaryData = Buffer.from([0xd3, 0xeb, 0xe9, 0xe1]);

    let receivedBody: ArrayBuffer | null = null;

    const api: ApiHandler = {
      handle: mock(async (req: Request) => {
        receivedBody = await req.arrayBuffer();
        return new Response("ok", { status: 200 });
      }),
    };
    server.ssrLoadModule.mockResolvedValue({ api });

    const plugin = elysiaPlugin({
      serverFile: "/server/api.ts",
    });

    const configureServer = plugin.configureServer as any;
    await configureServer(server);

    const middleware = middlewares[0]!;
    expect(middleware).toBeDefined();

    await runMiddlewareWithBody(middleware, "/api/upload", "POST", [binaryData]);

    expect(receivedBody).not.toBeNull();
    if (receivedBody) {
      const receivedBuffer = Buffer.from(receivedBody);
      expect(receivedBuffer.equals(binaryData)).toBe(true);

      // Also verify it didn't get corrupted to replacement chars
      // ef bf bd is replacement char
      const corrupted = Buffer.from([0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd]);
      expect(receivedBuffer.equals(corrupted)).toBe(false);
    }
  });
});
