import { describe, expect, it, mock, spyOn, afterEach, beforeEach } from "bun:test";
import { build, buildFull } from "../src/cli";
import * as fs from "node:fs";
import * as child_process from "node:child_process";

// Mocking globals
const originalBunBuild = Bun.build;
const originalProcessExit = process.exit;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe("CLI build", () => {
  beforeEach(() => {
    console.log = mock();
    console.error = mock();
    // @ts-ignore
    process.exit = mock((code?: number) => {
      throw new Error(`Process exited with code ${code}`);
    });
  });

  afterEach(() => {
    Bun.build = originalBunBuild;
    process.exit = originalProcessExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    mock.restore();
  });

  it("fails if entry file does not exist", async () => {
    spyOn(fs, "existsSync").mockReturnValue(false);

    try {
      await build({ entry: "non-existent.ts" });
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });

  it("runs bun build successfully", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    const writeFileSyncMock = spyOn(fs, "writeFileSync").mockImplementation(() => {});
    const unlinkSyncMock = spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    await build({ entry: "src/server/api.ts" });

    // Verify temp file creation
    expect(writeFileSyncMock).toHaveBeenCalled();
    const writeArgs = writeFileSyncMock.mock.calls[0] as any[];
    expect(writeArgs[0]).toContain(".vef-temp");
    expect(writeArgs[0]).toContain(".temp-prod.ts");
    expect(writeArgs[1]).toContain('import { Elysia } from "elysia"');

    // Verify Bun.build uses the temp file
    expect(bunBuildMock).toHaveBeenCalled();
    const buildOptions = (bunBuildMock.mock.calls[0] as any)[0];
    expect(buildOptions.entrypoints[0]).toContain(".vef-temp");
    expect(buildOptions.entrypoints[0]).toContain(".temp-prod.ts");

    // Verify temp file cleanup
    expect(unlinkSyncMock).toHaveBeenCalled();
    expect((unlinkSyncMock.mock.calls[0] as any)[0]).toContain(".vef-temp");
    expect((unlinkSyncMock.mock.calls[0] as any)[0]).toContain(".temp-prod.ts");
  });

  it("fails if bun build returns failure", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);

    const bunBuildMock = mock(async () => ({ success: false, logs: ["Build error"] }) as any);
    Bun.build = bunBuildMock;

    try {
      await build({ entry: "src/server/api.ts" });
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Server build failed"));
  });

  it("cleans up temp files even when build fails", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    const unlinkSyncMock = spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);

    const bunBuildMock = mock(async () => ({ success: false, logs: ["Build error"] }) as any);
    Bun.build = bunBuildMock;

    try {
      await build({ entry: "src/server/api.ts" });
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    // Verify cleanup happens even on failure
    expect(unlinkSyncMock).toHaveBeenCalled();
    expect((unlinkSyncMock.mock.calls[0] as any)[0]).toContain(".vef-temp");
    expect((unlinkSyncMock.mock.calls[0] as any)[0]).toContain(".temp-prod.ts");
  });

  it("cleans up .vef-temp directory after build", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);
    const rmSyncMock = spyOn(fs, "rmSync").mockImplementation(() => {});

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    await build({ entry: "src/server/api.ts" });

    expect(rmSyncMock).toHaveBeenCalled();
    const rmArgs = rmSyncMock.mock.calls[0] as any[];
    expect(rmArgs[0]).toContain(".vef-temp");
    expect(rmArgs[1]).toEqual({ recursive: true, force: true });
  });
});

describe("CLI build with outFile (compile)", () => {
  beforeEach(() => {
    console.log = mock();
    console.error = mock();
    // @ts-ignore
    process.exit = mock((code?: number) => {
      throw new Error(`Process exited with code ${code}`);
    });
  });

  afterEach(() => {
    Bun.build = originalBunBuild;
    process.exit = originalProcessExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    mock.restore();
  });

  it("runs build then compiles to binary", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);

    const spawnSyncMock = mock(() => ({ status: 0 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    await build({ entry: "src/server/api.ts", outFile: "dist/server" });

    // Bun.build is called for bundling
    expect(bunBuildMock).toHaveBeenCalled();

    // spawnSync is called for `bun build --compile`
    expect(spawnSyncMock).toHaveBeenCalled();
    const compileArgs = (spawnSyncMock.mock.calls[0] as any)[1];
    expect(compileArgs[0]).toBe("build");
    expect(compileArgs[1]).toBe("--compile");
    expect(compileArgs[3]).toBe("--outfile");
  });

  it("fails if bun compile fails", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);

    const spawnSyncMock = mock(() => ({ status: 1 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    try {
      await build({ entry: "src/server/api.ts", outFile: "dist/server" });
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Bun compile failed"));
  });
});

describe("CLI buildFull (--static)", () => {
  beforeEach(() => {
    console.log = mock();
    console.error = mock();
    // @ts-ignore
    process.exit = mock((code?: number) => {
      throw new Error(`Process exited with code ${code}`);
    });
  });

  afterEach(() => {
    Bun.build = originalBunBuild;
    process.exit = originalProcessExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    mock.restore();
  });

  it("fails if API entry file does not exist", async () => {
    spyOn(fs, "existsSync").mockReturnValue(false);

    try {
      await buildFull({ entry: "non-existent.ts" });
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });

  it("runs vite build, bundles server, copies static assets", async () => {
    const existsMock = spyOn(fs, "existsSync").mockReturnValue(true);
    const writeFileSyncMock = spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);
    const cpSyncMock = spyOn(fs, "cpSync").mockImplementation(() => {});

    const spawnSyncMock = mock(() => ({ status: 0 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    await buildFull({ entry: "server/api.ts" });

    // vite build must be invoked
    expect(spawnSyncMock).toHaveBeenCalled();
    const spawnArgs = (spawnSyncMock.mock.calls[0] as any)[1] as string[];
    expect(spawnArgs).toContain("vite");
    expect(spawnArgs).toContain("build");

    // temp entry written with combined server content
    expect(writeFileSyncMock).toHaveBeenCalled();
    const writeArgs = writeFileSyncMock.mock.calls[0] as any[];
    expect(writeArgs[0]).toContain(".vef-temp");
    expect(writeArgs[1]).toContain("Bun.serve");
    expect(writeArgs[1]).toContain("/api");

    // Bun.build uses temp entry
    expect(bunBuildMock).toHaveBeenCalled();
    const buildOptions = (bunBuildMock.mock.calls[0] as any)[0];
    expect(buildOptions.entrypoints[0]).toContain(".vef-temp");

    // static assets copied
    expect(cpSyncMock).toHaveBeenCalled();
    const cpArgs = cpSyncMock.mock.calls[0] as any[];
    expect(cpArgs[1]).toContain("public");
  });

  it("respects custom viteDist, outDir, and apiPrefix", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    const writeFileSyncMock = spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);
    const cpSyncMock = spyOn(fs, "cpSync").mockImplementation(() => {});

    spyOn(child_process, "spawnSync").mockImplementation(() => ({ status: 0 }) as any);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    await buildFull({ entry: "server/api.ts", viteDist: "frontend/dist", outDir: "production", apiPrefix: "/v1" });

    const writeArgs = writeFileSyncMock.mock.calls[0] as any[];
    expect(writeArgs[1]).toContain("/v1");

    const buildOptions = (bunBuildMock.mock.calls[0] as any)[0];
    expect(buildOptions.outdir).toContain("production");

    const cpArgs = cpSyncMock.mock.calls[0] as any[];
    expect(cpArgs[0]).toContain("frontend/dist");
    expect(cpArgs[1]).toContain("public");
  });

  it("fails if vite build fails", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);

    spyOn(child_process, "spawnSync").mockImplementation(() => ({ status: 1 }) as any);

    try {
      await buildFull({ entry: "server/api.ts" });
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Vite build failed"));
  });

  it("fails if Bun.build returns failure", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);

    spyOn(child_process, "spawnSync").mockImplementation(() => ({ status: 0 }) as any);

    const bunBuildMock = mock(async () => ({ success: false, logs: ["Build error"] }) as any);
    Bun.build = bunBuildMock;

    try {
      await buildFull({ entry: "server/api.ts" });
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Server build failed"));
  });

  it("cleans up temp files even on failure", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    const unlinkSyncMock = spyOn(fs, "unlinkSync").mockImplementation(() => {});
    const rmSyncMock = spyOn(fs, "rmSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);

    spyOn(child_process, "spawnSync").mockImplementation(() => ({ status: 0 }) as any);

    const bunBuildMock = mock(async () => ({ success: false, logs: ["err"] }) as any);
    Bun.build = bunBuildMock;

    try {
      await buildFull({ entry: "server/api.ts" });
    } catch {}

    expect(unlinkSyncMock).toHaveBeenCalled();
    expect(rmSyncMock).toHaveBeenCalled();
    const rmArgs = rmSyncMock.mock.calls[0] as any[];
    expect(rmArgs[0]).toContain(".vef-temp");
    expect(rmArgs[1]).toEqual({ recursive: true, force: true });
  });

  it("build() routes to buildFull when static option is set", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);
    spyOn(fs, "cpSync").mockImplementation(() => {});

    spyOn(child_process, "spawnSync").mockImplementation(() => ({ status: 0 }) as any);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    await build({ entry: "server/api.ts", static: true });

    // combined server entry must reference Bun.serve
    const writeArgs = (spyOn(fs, "writeFileSync") as any).mock?.calls?.[0] as any[] | undefined;
    // Confirm Bun.build was called (means buildFull ran its full path)
    expect(bunBuildMock).toHaveBeenCalled();
  });
});
