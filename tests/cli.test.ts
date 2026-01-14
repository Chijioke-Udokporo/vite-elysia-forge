import { describe, expect, it, mock, spyOn, afterEach, beforeEach } from "bun:test";
import { build } from "../src/cli";
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
