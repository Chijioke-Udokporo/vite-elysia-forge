#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { resolve, relative, sep } from "node:path";

export async function build(apiEntry: string = "src/server/api.ts") {
  const absoluteApiEntry = resolve(process.cwd(), apiEntry);

  if (!existsSync(absoluteApiEntry)) {
    console.error(`❌ API entry file "${apiEntry}" not found.`);
    console.error(`   By default, vite-elysia-forge looks for "src/server/api.ts".`);
    console.error(`   If your API is located elsewhere, please specify the path:`);
    console.error(`   $ vite-elysia-forge build <path-to-your-api-file>`);
    process.exit(1);
  }

  // Run vite build
  const viteBuild = spawnSync("bun", ["x", "vite", "build"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });

  if (viteBuild.status !== 0) {
    console.error("❌ Vite build failed");
    process.exit(viteBuild.status || 1);
  }

  // Create a temporary entry file
  const outputDir = resolve(process.cwd(), ".output");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const tempEntry = resolve(outputDir, ".temp-prod.ts");

  // Calculate relative path from outputDir to api entry
  let relativeApiEntry = relative(outputDir, absoluteApiEntry);
  // Normalize path separators for imports (Windows support)
  relativeApiEntry = relativeApiEntry.split(sep).join("/");
  if (!relativeApiEntry.startsWith(".")) relativeApiEntry = "./" + relativeApiEntry;

  const tempContent = `
import { startServer } from "vite-elysia-forge/production";
import { api } from "${relativeApiEntry}";

startServer({
  api,
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  distDir: "dist",
});
`;

  writeFileSync(tempEntry, tempContent);

  // We use Bun.build to bundle the server
  // This requires the script to be run with Bun
  try {
    const result = await Bun.build({
      entrypoints: [tempEntry],
      outdir: "dist", // Output to dist alongside vite assets
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
  } catch (e) {
    console.error("❌ Failed to build server. Ensure you are running this command with Bun.");
    console.error(e);
    process.exit(1);
  } finally {
    // Clean up temp file
    if (existsSync(tempEntry)) {
      unlinkSync(tempEntry);
    }
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }
}

export async function buildCompile(apiEntry: string = "src/server/api.ts") {
  await build(apiEntry);

  const compile = spawnSync("bun", ["build", "--compile", "dist/server.js", "--outfile", "dist/server"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });

  if (compile.status !== 0) {
    console.error("❌ Bun compile failed");
    process.exit(compile.status || 1);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "build") {
    const entry = args[1];
    build(entry);
  } else if (command === "build-compile") {
    const entry = args[1];
    buildCompile(entry);
  } else {
    console.log("Usage: vite-elysia-forge <command> [api-entry]");
    console.log("Commands:");
    console.log("  build          Build frontend + bundle server to dist/server.js");
    console.log("  build-compile  Build and compile a standalone server binary to dist/server");
    console.log("");
    console.log("api-entry: Path to your API entry file (default: src/server/api.ts)");
  }
}
