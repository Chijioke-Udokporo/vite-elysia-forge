import { describe, expect, it, mock, spyOn, afterEach } from "bun:test";
import { startServer } from "../src/production";
import { join } from "node:path";

describe("startServer", () => {
  const originalBunServe = Bun.serve;
  const originalBunFile = Bun.file;
  const originalConsoleLog = console.log;

  afterEach(() => {
    Bun.serve = originalBunServe;
    Bun.file = originalBunFile;
    console.log = originalConsoleLog;
  });

  it("starts a Bun server with correct port", () => {
    const serveMock = mock(() => ({ stop: () => {} }) as any);
    Bun.serve = serveMock;
    console.log = mock();

    const api = { handle: mock() };
    startServer({ api, port: 4000 });

    expect(serveMock).toHaveBeenCalled();
    const options = (serveMock.mock.calls[0] as any)[0];
    expect(options.port).toBe(4000);
  });

  it("handles API requests", async () => {
    let fetchHandler: (req: Request) => Promise<Response>;
    const serveMock = mock((options: any) => {
      fetchHandler = options.fetch;
      return { stop: () => {} } as any;
    });
    Bun.serve = serveMock;
    console.log = mock();

    const api = {
      handle: mock(async () => new Response("API Response")),
    };

    startServer({ api });

    const req = new Request("http://localhost:3000/api/test");
    const res = await fetchHandler!(req);

    expect(api.handle).toHaveBeenCalledWith(req);
    expect(await res.text()).toBe("API Response");
  });

  it("serves static files if they exist", async () => {
    let fetchHandler: (req: Request) => Promise<Response>;
    const serveMock = mock((options: any) => {
      fetchHandler = options.fetch;
      return { stop: () => {} } as any;
    });
    Bun.serve = serveMock;
    console.log = mock();

    const mockFile = {
      exists: async () => true,
    };
    Bun.file = mock(() => mockFile as any);

    startServer({ api: { handle: mock() } });

    const req = new Request("http://localhost:3000/assets/style.css");
    const res = await fetchHandler!(req);

    expect(Bun.file).toHaveBeenCalledWith(expect.stringContaining("assets/style.css"));
    expect(res).toBeInstanceOf(Response);
  });

  it("falls back to index.html for SPA routing on GET requests", async () => {
    let fetchHandler: (req: Request) => Promise<Response>;
    const serveMock = mock((options: any) => {
      fetchHandler = options.fetch;
      return { stop: () => {} } as any;
    });
    Bun.serve = serveMock;
    console.log = mock();

    // Mock file not existing for the requested path
    // But existing for index.html
    Bun.file = mock((path: any) => {
      if (typeof path === "string" && path.endsWith("index.html")) {
        return { exists: async () => true } as any;
      }
      return { exists: async () => false } as any;
    });

    startServer({ api: { handle: mock() } });

    const req = new Request("http://localhost:3000/some/route", { method: "GET" });
    const res = await fetchHandler!(req);

    expect(Bun.file).toHaveBeenCalledWith(expect.stringContaining("index.html"));
    expect(res).toBeInstanceOf(Response);
  });

  it("returns 404 for non-GET requests when file not found", async () => {
    let fetchHandler: (req: Request) => Promise<Response>;
    const serveMock = mock((options: any) => {
      fetchHandler = options.fetch;
      return { stop: () => {} } as any;
    });
    Bun.serve = serveMock;
    console.log = mock();

    Bun.file = mock(() => ({ exists: async () => false }) as any);

    startServer({ api: { handle: mock() } });

    const req = new Request("http://localhost:3000/some/route", { method: "POST" });
    const res = await fetchHandler!(req);

    expect(res.status).toBe(404);
  });
});
