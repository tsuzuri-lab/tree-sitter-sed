#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const {
  existsSync,
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, dirname, isAbsolute, join, resolve } = require("node:path");
const { downloadVerified } = require("./download-verified");

const asset = "wasi-sdk-29.0-x86_64-linux.tar.gz";
const sha256 = "87d1d1a2879d139cdc624b968efad3d4a97b8078cdff95e63ac88ecafd1a0171";
const url = `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-29/${asset}`;

async function main() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("The verified Wasm CI setup currently supports Linux x64 only");
  }

  const configuredDestination = process.env.TREE_SITTER_WASI_SDK_PATH;
  if (!configuredDestination || !isAbsolute(configuredDestination)) {
    throw new Error("TREE_SITTER_WASI_SDK_PATH must be an absolute path");
  }

  const destination = resolve(configuredDestination);
  if (existsSync(destination)) {
    throw new Error(`Refusing to trust or replace existing WASI SDK directory: ${destination}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  const downloadDirectory = mkdtempSync(join(tmpdir(), "wasi-sdk-download-"));
  const stagingDirectory = mkdtempSync(join(dirname(destination), ".wasi-sdk-stage-"));
  const archivePath = join(downloadDirectory, basename(asset));

  try {
    console.log(`Downloading ${url}`);
    await downloadVerified({
      url,
      destination: archivePath,
      sha256,
      maxBytes: 256 * 1024 * 1024,
    });

    const result = spawnSync(
      "tar",
      ["-xzf", archivePath, "-C", stagingDirectory, "--strip-components=1"],
      { stdio: "inherit" },
    );
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`tar exited with status ${result.status}`);
    }
    if (!existsSync(join(stagingDirectory, "bin", "clang"))) {
      throw new Error("Verified WASI SDK archive did not contain bin/clang");
    }

    renameSync(stagingDirectory, destination);
    console.log(`Installed WASI SDK 29.0; verified SHA-256 ${sha256}`);
  } finally {
    rmSync(downloadDirectory, { recursive: true, force: true });
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
