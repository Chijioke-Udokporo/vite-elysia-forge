import { describe, expect, it, mock, spyOn, afterEach, beforeEach } from "bun:test";
import { build, buildCompile } from "../src/cli";
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
      await build("non-existent.ts");
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });

  it("runs vite build and bun build successfully", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    const writeFileSyncMock = spyOn(fs, "writeFileSync").mockImplementation(() => {});
    const unlinkSyncMock = spyOn(fs, "unlinkSync").mockImplementation(() => {});

    const spawnSyncMock = mock(() => ({ status: 0 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    await build("src/server/api.ts");

    expect(spawnSyncMock).toHaveBeenCalled();
    const args = (spawnSyncMock.mock.calls[0] as any)[1];
    expect(args).toContain("vite");
    expect(args).toContain("build");

    // Verify temp file creation
    expect(writeFileSyncMock).toHaveBeenCalled();
    const writeArgs = writeFileSyncMock.mock.calls[0] as any[];
    expect(writeArgs[0]).toContain(".output");
    expect(writeArgs[0]).toContain(".temp-prod.ts");
    expect(writeArgs[1]).toContain('import { startServer } from "vite-elysia-forge/production"');

    // Verify Bun.build uses the temp file
    expect(bunBuildMock).toHaveBeenCalled();
    const buildOptions = (bunBuildMock.mock.calls[0] as any)[0];
    expect(buildOptions.entrypoints[0]).toContain(".output");
    expect(buildOptions.entrypoints[0]).toContain(".temp-prod.ts");

    // Verify temp file cleanup
    expect(unlinkSyncMock).toHaveBeenCalled();
    expect((unlinkSyncMock.mock.calls[0] as any)[0]).toContain(".output");
    expect((unlinkSyncMock.mock.calls[0] as any)[0]).toContain(".temp-prod.ts");
  });

  it("fails if vite build fails", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);

    const spawnSyncMock = mock(() => ({ status: 1 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    try {
      await build("src/server/api.ts");
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Vite build failed"));
  });

  it("fails if bun build fails", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    const unlinkSyncMock = spyOn(fs, "unlinkSync").mockImplementation(() => {});

    const spawnSyncMock = mock(() => ({ status: 0 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    const bunBuildMock = mock(async () => ({ success: false, logs: ["Build error"] }) as any);
    Bun.build = bunBuildMock;

    try {
      await build("src/server/api.ts");
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Server build failed"));

    // Verify cleanup happens even on failure
    expect(unlinkSyncMock).toHaveBeenCalled();
    expect((unlinkSyncMock.mock.calls[0] as any)[0]).toContain(".output");
    expect((unlinkSyncMock.mock.calls[0] as any)[0]).toContain(".temp-prod.ts");
  });

  it("cleans up .output directory after build", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    const rmSyncMock = spyOn(fs, "rmSync").mockImplementation(() => {});

    const spawnSyncMock = mock(() => ({ status: 0 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    await build("src/server/api.ts");

    expect(rmSyncMock).toHaveBeenCalled();
    const rmArgs = rmSyncMock.mock.calls[0] as any[];
    expect(rmArgs[0]).toContain(".output");
    expect(rmArgs[1]).toEqual({ recursive: true, force: true });
  });
});

describe("CLI build-compile", () => {
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

  it("runs build then compiles to dist/server", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});

    const spawnSyncMock = mock(() => ({ status: 0 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    await buildCompile("src/server/api.ts");

    // First call is `bun x vite build`, second call is `bun build --compile ...`
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    const firstArgs = (spawnSyncMock.mock.calls[0] as any)[1];
    expect(firstArgs).toContain("vite");
    expect(firstArgs).toContain("build");

    const secondArgs = (spawnSyncMock.mock.calls[1] as any)[1];
    // Now uses absolute paths
    expect(secondArgs[0]).toBe("build");
    expect(secondArgs[1]).toBe("--compile");
    expect(secondArgs[2]).toEndWith("dist/server.js");
    expect(secondArgs[3]).toBe("--outfile");
    expect(secondArgs[4]).toEndWith("dist/server");
  });

  it("fails if bun compile fails", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(fs, "unlinkSync").mockImplementation(() => {});
    spyOn(fs, "rmSync").mockImplementation(() => {});

    const spawnSyncMock = mock(() => ({ status: 0 }) as any);
    const spawnSyncSpy = spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    // Make the second spawnSync (compile) fail
    spawnSyncMock
      .mockImplementationOnce(() => ({ status: 0 }) as any)
      .mockImplementationOnce(() => ({ status: 1 }) as any);

    try {
      await buildCompile("src/server/api.ts");
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(spawnSyncSpy).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Bun compile failed"));
  });
});
