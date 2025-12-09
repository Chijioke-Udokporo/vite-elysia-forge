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
      await build("non-existent.ts");
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });

  it("runs vite build and bun build successfully", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);

    const spawnSyncMock = mock(() => ({ status: 0 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    const bunBuildMock = mock(async () => ({ success: true, logs: [] }) as any);
    Bun.build = bunBuildMock;

    await build("prod.ts");

    expect(spawnSyncMock).toHaveBeenCalled();
    const args = (spawnSyncMock.mock.calls[0] as any)[1];
    expect(args).toContain("vite");
    expect(args).toContain("build");

    expect(bunBuildMock).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Build complete"));
  });

  it("fails if vite build fails", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);

    const spawnSyncMock = mock(() => ({ status: 1 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    try {
      await build("prod.ts");
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Vite build failed"));
  });

  it("fails if bun build fails", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);

    const spawnSyncMock = mock(() => ({ status: 0 }) as any);
    spyOn(child_process, "spawnSync").mockImplementation(spawnSyncMock);

    const bunBuildMock = mock(async () => ({ success: false, logs: ["Build error"] }) as any);
    Bun.build = bunBuildMock;

    try {
      await build("prod.ts");
    } catch (e: any) {
      expect(e.message).toBe("Process exited with code 1");
    }

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Server build failed"));
  });
});
