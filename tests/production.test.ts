import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";

let lastInstance: any;
// Mock Elysia before importing startServer
mock.module("elysia", () => {
  return {
    Elysia: class {
      constructor() {
        lastInstance = this;
      }
      use = mock(() => this);
      all = mock(() => this);
      listen = mock(() => this);
    },
  };
});

import { startServer } from "../src/production";
import { Elysia } from "elysia";

describe("startServer", () => {
  const originalConsoleLog = console.log;

  beforeEach(() => {
    console.log = mock();
    lastInstance = null;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it("starts an Elysia server with correct port", () => {
    const api = new Elysia();
    startServer({ api, port: 4000 });

    expect(lastInstance).toBeDefined();
    expect(lastInstance.listen).toHaveBeenCalledWith(4000);
  });

  it("mounts the api and static handler", () => {
    const api = new Elysia();
    startServer({ api });

    expect(lastInstance.use).toHaveBeenCalledWith(api);
    expect(lastInstance.all).toHaveBeenCalledWith("/*", expect.any(Function));
  });
});
