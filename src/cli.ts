#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, sep, join, basename } from "node:path";

/**
 * Build options for customizing output directories.
 */
export interface BuildOptions {
  /**
   * Path to the API entry file.
   * @default "src/server/api.ts"
   */
  apiEntry?: string;
  /**
   * Output directory for the Vite/frontend static assets.
   * @default "dist"
   */
  staticDir?: string;
  /**
   * Output directory for the Elysia server bundle.
   * When set to a different value than staticDir, the server and static assets
   * will be built to separate directories.
   * @default "dist" (same as staticDir)
   */
  serverDir?: string;
  /**
   * Whether to skip the Vite frontend build.
   * Useful when you only want to rebuild the server.
   * @default false
   */
  skipVite?: boolean;
  /**
   * Whether to skip the server build.
   * Useful when you only want to rebuild the frontend.
   * @default false
   */
  skipServer?: boolean;
}

/**
 * Copies a directory recursively.
 */
function copyDir(src: string, dest: string): void {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export async function build(options: BuildOptions | string = {}): Promise<void> {
  // Support legacy string argument for backward compatibility
  const opts: BuildOptions = typeof options === "string" ? { apiEntry: options } : options;

  const apiEntry = opts.apiEntry || "src/server/api.ts";
  const staticDir = opts.staticDir || "dist";
  const serverDir = opts.serverDir || staticDir;
  const skipVite = opts.skipVite || false;
  const skipServer = opts.skipServer || false;
  const separateOutputs = staticDir !== serverDir;

  const absoluteApiEntry = resolve(process.cwd(), apiEntry);

  if (!skipServer && !existsSync(absoluteApiEntry)) {
    console.error(`❌ API entry file "${apiEntry}" not found.`);
    console.error(`   By default, vite-elysia-forge looks for "src/server/api.ts".`);
    console.error(`   If your API is located elsewhere, please specify the path:`);
    console.error(`   $ vite-elysia-forge build --api <path-to-your-api-file>`);
    process.exit(1);
  }

  // Run vite build
  if (!skipVite) {
    console.log(`📦 Building frontend to "${staticDir}"...`);
    const viteBuild = spawnSync("bun", ["x", "vite", "build", "--outDir", staticDir], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });

    if (viteBuild.status !== 0) {
      console.error("❌ Vite build failed");
      process.exit(viteBuild.status || 1);
    }
    console.log(`✅ Frontend built to "${staticDir}"`);
  }

  if (skipServer) {
    console.log("⏭️  Skipping server build (--skip-server)");
    return;
  }

  // Create a temporary entry file
  const tempDir = resolve(process.cwd(), ".output");
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  const tempEntry = resolve(tempDir, ".temp-prod.ts");

  // Calculate relative path from tempDir to api entry
  let relativeApiEntry = relative(tempDir, absoluteApiEntry);
  // Normalize path separators for imports (Windows support)
  relativeApiEntry = relativeApiEntry.split(sep).join("/");
  if (!relativeApiEntry.startsWith(".")) relativeApiEntry = "./" + relativeApiEntry;

  // For separate outputs, the server needs to know the path to static assets
  // We use a relative path from serverDir to staticDir
  let staticDirPath: string;
  if (separateOutputs) {
    const absServerDir = resolve(process.cwd(), serverDir);
    const absStaticDir = resolve(process.cwd(), staticDir);
    staticDirPath = relative(absServerDir, absStaticDir);
    if (!staticDirPath.startsWith(".")) staticDirPath = "./" + staticDirPath;
    // Normalize for cross-platform
    staticDirPath = staticDirPath.split(sep).join("/");
  } else {
    staticDirPath = "."; // Same directory
  }

  const tempContent = `
import { startServer } from "vite-elysia-forge/production";
import { api } from ${JSON.stringify(relativeApiEntry)};

startServer({
  api,
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  distDir: process.env.STATIC_DIR || ${JSON.stringify(staticDirPath)},
});
`;

  writeFileSync(tempEntry, tempContent);

  // Ensure server output directory exists
  const absServerDir = resolve(process.cwd(), serverDir);
  if (!existsSync(absServerDir)) mkdirSync(absServerDir, { recursive: true });

  console.log(`📦 Building server to "${serverDir}"...`);

  // We use Bun.build to bundle the server
  // This requires the script to be run with Bun
  try {
    const result = await Bun.build({
      entrypoints: [tempEntry],
      outdir: serverDir,
      target: "bun",
      minify: true,
      naming: "server.js", // Fixed name for simplicity
    });

    if (!result.success) {
      console.error("❌ Server build failed");
      for (const log of result.logs) {
        console.error(log);
      }
      process.exit(1);
    }
    console.log(`✅ Server built to "${serverDir}/server.js"`);
  } catch (e) {
    console.error("❌ Failed to build server. Ensure you are running this command with Bun.");
    console.error(e);
    process.exit(1);
  } finally {
    // Clean up temp file
    if (existsSync(tempEntry)) {
      unlinkSync(tempEntry);
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  if (separateOutputs) {
    console.log(`\n📁 Output structure:`);
    console.log(`   Static assets: ${staticDir}/`);
    console.log(`   Server bundle: ${serverDir}/server.js`);
    console.log(`\n💡 To run: cd ${serverDir} && bun server.js`);
    console.log(`   Or set STATIC_DIR to override the static assets path`);
  }
}

export async function buildCompile(options: BuildOptions | string = {}): Promise<void> {
  // Support legacy string argument for backward compatibility
  const opts: BuildOptions = typeof options === "string" ? { apiEntry: options } : options;
  const serverDir = opts.serverDir || opts.staticDir || "dist";

  await build(opts);

  console.log(`🔧 Compiling server to standalone binary...`);
  const serverPath = resolve(process.cwd(), serverDir, "server.js");
  const outputPath = resolve(process.cwd(), serverDir, "server");

  const compile = spawnSync("bun", ["build", "--compile", serverPath, "--outfile", outputPath], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });

  if (compile.status !== 0) {
    console.error("❌ Bun compile failed");
    process.exit(compile.status || 1);
  }
  console.log(`✅ Compiled standalone binary: ${serverDir}/server`);
}

/**
 * Parse CLI arguments into BuildOptions
 */
function parseArgs(args: string[]): BuildOptions {
  const opts: BuildOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--api":
      case "-a":
        if (nextArg && !nextArg.startsWith("-")) {
          opts.apiEntry = nextArg;
          i++;
        }
        break;
      case "--static":
      case "-s":
        if (nextArg && !nextArg.startsWith("-")) {
          opts.staticDir = nextArg;
          i++;
        }
        break;
      case "--server":
      case "-o":
        if (nextArg && !nextArg.startsWith("-")) {
          opts.serverDir = nextArg;
          i++;
        }
        break;
      case "--skip-vite":
        opts.skipVite = true;
        break;
      case "--skip-server":
        opts.skipServer = true;
        break;
      default:
        // Legacy positional argument support: first non-flag arg is apiEntry
        if (arg && !arg.startsWith("-") && !opts.apiEntry) {
          opts.apiEntry = arg;
        }
    }
  }

  return opts;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  if (command === "build") {
    const opts = parseArgs(commandArgs);
    build(opts);
  } else if (command === "build-compile") {
    const opts = parseArgs(commandArgs);
    buildCompile(opts);
  } else if (command === "build-static") {
    // Convenience command: build only frontend
    const opts = parseArgs(commandArgs);
    opts.skipServer = true;
    build(opts);
  } else if (command === "build-server") {
    // Convenience command: build only server (assumes frontend already built)
    const opts = parseArgs(commandArgs);
    opts.skipVite = true;
    build(opts);
  } else {
    console.log("Usage: vite-elysia-forge <command> [options]");
    console.log("");
    console.log("Commands:");
    console.log("  build          Build frontend + bundle server");
    console.log("  build-compile  Build and compile a standalone server binary");
    console.log("  build-static   Build only the frontend (skip server)");
    console.log("  build-server   Build only the server (skip frontend)");
    console.log("");
    console.log("Options:");
    console.log("  --api, -a <path>     Path to API entry file (default: src/server/api.ts)");
    console.log("  --static, -s <dir>   Output directory for static assets (default: dist)");
    console.log("  --server, -o <dir>   Output directory for server bundle (default: same as --static)");
    console.log("  --skip-vite          Skip the Vite frontend build");
    console.log("  --skip-server        Skip the server build");
    console.log("");
    console.log("Examples:");
    console.log("  # Build everything to 'dist/' (default)");
    console.log("  vite-elysia-forge build");
    console.log("");
    console.log("  # Build with separate output directories");
    console.log("  vite-elysia-forge build --static dist --server .output");
    console.log("");
    console.log("  # Build only the frontend");
    console.log("  vite-elysia-forge build-static --static public");
    console.log("");
    console.log("  # Build only the server to a separate folder");
    console.log("  vite-elysia-forge build-server --server .output --static dist");
  }
}
