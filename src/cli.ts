#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export async function build(entryFile: string = "prod.ts") {
  const absoluteEntry = resolve(process.cwd(), entryFile);

  if (!existsSync(absoluteEntry)) {
    console.error(`❌ Entry file "${entryFile}" not found.`);
    console.log("Please create a production entry file (e.g., prod.ts) that imports your API and calls startServer.");
    process.exit(1);
  }

  console.log("📦 Building Vite app...");
  // Run vite build
  const viteBuild = spawnSync("bun", ["x", "vite", "build"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });

  if (viteBuild.status !== 0) {
    console.error("❌ Vite build failed");
    process.exit(viteBuild.status || 1);
  }

  console.log("🥟 Building Elysia server for Bun...");

  // We use Bun.build to bundle the server
  // This requires the script to be run with Bun
  try {
    const result = await Bun.build({
      entrypoints: [absoluteEntry],
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
  }

  console.log("✅ Build complete!");
  console.log("   Run your production server with:");
  console.log("   $ bun dist/server.js");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "build") {
    const entry = args[1];
    build(entry);
  } else {
    console.log("Usage: vite-elysia-forge build [entry-file]");
    console.log("  entry-file: Path to your production entry (default: prod.ts)");
  }
}
