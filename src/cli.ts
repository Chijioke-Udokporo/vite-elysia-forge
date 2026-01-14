#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { resolve, relative, sep, dirname } from "node:path";

/**
 * Bun build target options.
 */
export type BuildTarget = "bun" | "node" | "browser";

/**
 * Build options for the server bundle.
 */
export interface BuildOptions {
  /**
   * Path to the API entry file.
   * @default "server/api.ts"
   */
  entry?: string;
  /**
   * Output directory for the server bundle (used with --outDir).
   * Mutually exclusive with outFile.
   */
  outDir?: string;
  /**
   * Output file path for compiled standalone binary (used with --outFile).
   * Mutually exclusive with outDir.
   */
  outFile?: string;
  /**
   * Build target for Bun.build.
   * @default "bun"
   */
  target?: BuildTarget;
  /**
   * Whether to minify the output.
   * @default true
   */
  minify?: boolean;
}

export async function build(options: BuildOptions = {}): Promise<void> {
  const entry = options.entry || "server/api.ts";
  const target = options.target || "bun";
  const minify = options.minify !== false;

  const absoluteEntry = resolve(process.cwd(), entry);

  if (!existsSync(absoluteEntry)) {
    console.error(`❌ API entry file "${entry}" not found.`);
    console.error(`   By default, vite-elysia-forge looks for "server/api.ts".`);
    console.error(`   If your API is located elsewhere, please specify the path:`);
    console.error(`   $ vite-elysia-forge build --entry <path-to-your-api-file>`);
    process.exit(1);
  }

  // Create a temporary entry file that wraps the API
  const tempDir = resolve(process.cwd(), ".vef-temp");
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  const tempEntry = resolve(tempDir, ".temp-prod.ts");

  // Calculate relative path from tempDir to api entry
  let relativeEntry = relative(tempDir, absoluteEntry);
  // Normalize path separators for imports (Windows support)
  relativeEntry = relativeEntry.split(sep).join("/");
  if (!relativeEntry.startsWith(".")) relativeEntry = "./" + relativeEntry;

  const tempContent = `
import { Elysia } from "elysia";
import { api } from ${JSON.stringify(relativeEntry)};

const app = new Elysia();
if (api) app.use(api);

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(port);

console.log(\`Production server running at http://localhost:\${port}\`);
`;

  writeFileSync(tempEntry, tempContent);

  try {
    if (options.outFile) {
      // Compile to standalone binary
      await buildCompile(tempEntry, options.outFile, target, minify);
    } else {
      // Bundle to directory
      const outDir = options.outDir || "dist";
      await buildBundle(tempEntry, outDir, target, minify);
    }
  } finally {
    // Clean up temp files
    if (existsSync(tempEntry)) {
      unlinkSync(tempEntry);
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

async function buildBundle(entryPath: string, outDir: string, target: BuildTarget, minify: boolean): Promise<void> {
  const absOutDir = resolve(process.cwd(), outDir);
  if (!existsSync(absOutDir)) mkdirSync(absOutDir, { recursive: true });

  console.log(`📦 Building server to "${outDir}/" (target: ${target})...`);

  try {
    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir: absOutDir,
      target,
      minify,
      naming: "server.js",
    });

    if (!result.success) {
      console.error("❌ Server build failed");
      for (const log of result.logs) {
        console.error(log);
      }
      process.exit(1);
    }
    console.log(`✅ Server built to "${outDir}/server.js"`);
    console.log(`\n💡 To run: bun ${outDir}/server.js`);
  } catch (e) {
    console.error("❌ Failed to build server. Ensure you are running this command with Bun.");
    console.error(e);
    process.exit(1);
  }
}

async function buildCompile(entryPath: string, outFile: string, target: BuildTarget, minify: boolean): Promise<void> {
  const absOutFile = resolve(process.cwd(), outFile);
  const outDir = dirname(absOutFile);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // First bundle to a temp file
  const tempBundleDir = resolve(process.cwd(), ".vef-temp-bundle");
  if (!existsSync(tempBundleDir)) mkdirSync(tempBundleDir, { recursive: true });

  console.log(`📦 Building and compiling server to "${outFile}" (target: ${target})...`);

  try {
    // Bundle first
    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir: tempBundleDir,
      target,
      minify,
      naming: "server.js",
    });

    if (!result.success) {
      console.error("❌ Server build failed");
      for (const log of result.logs) {
        console.error(log);
      }
      process.exit(1);
    }

    // Then compile to binary
    const bundledPath = resolve(tempBundleDir, "server.js");
    const compile = spawnSync("bun", ["build", "--compile", bundledPath, "--outfile", absOutFile], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });

    if (compile.status !== 0) {
      console.error("❌ Bun compile failed");
      process.exit(compile.status || 1);
    }

    console.log(`✅ Compiled standalone binary: ${outFile}`);
    console.log(`\n💡 To run: ./${outFile}`);
  } catch (e) {
    console.error("❌ Failed to compile server. Ensure you are running this command with Bun.");
    console.error(e);
    process.exit(1);
  } finally {
    // Clean up temp bundle
    if (existsSync(tempBundleDir)) {
      rmSync(tempBundleDir, { recursive: true, force: true });
    }
  }
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
      case "--entry":
      case "-e":
        if (nextArg && !nextArg.startsWith("-")) {
          opts.entry = nextArg;
          i++;
        }
        break;
      case "--outDir":
      case "-d":
        if (nextArg && !nextArg.startsWith("-")) {
          opts.outDir = nextArg;
          i++;
        }
        break;
      case "--outFile":
      case "-o":
        if (nextArg && !nextArg.startsWith("-")) {
          opts.outFile = nextArg;
          i++;
        }
        break;
      case "--target":
      case "-t":
        if (nextArg && !nextArg.startsWith("-")) {
          opts.target = nextArg as BuildTarget;
          i++;
        }
        break;
      case "--no-minify":
        opts.minify = false;
        break;
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

    // Validate mutually exclusive options
    if (opts.outDir && opts.outFile) {
      console.error("❌ Cannot use both --outDir and --outFile. Choose one.");
      process.exit(1);
    }

    build(opts);
  } else {
    console.log("Usage: vite-elysia-forge build [options]");
    console.log("");
    console.log("Build the Elysia server for production.");
    console.log("");
    console.log("Options:");
    console.log("  --entry, -e <path>    Path to API entry file (default: server/api.ts)");
    console.log("  --outDir, -d <dir>    Output directory for bundled server.js");
    console.log("  --outFile, -o <file>  Output path for compiled standalone binary");
    console.log("  --target, -t <target> Build target: bun, node, browser (default: bun)");
    console.log("  --no-minify           Disable minification");
    console.log("");
    console.log("Examples:");
    console.log("  # Bundle server to dist/server.js");
    console.log("  vite-elysia-forge build --outDir dist");
    console.log("");
    console.log("  # Bundle with node target");
    console.log("  vite-elysia-forge build --outDir dist --target node");
    console.log("");
    console.log("  # Compile to standalone binary");
    console.log("  vite-elysia-forge build --outFile server");
    console.log("");
    console.log("  # Compile with custom entry");
    console.log("  vite-elysia-forge build --entry src/api/index.ts --outFile myserver");
  }
}
