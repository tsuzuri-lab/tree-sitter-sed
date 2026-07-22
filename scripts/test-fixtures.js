#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, relative } = require("node:path");

const root = join(__dirname, "..");
const fixtureRoot = join(root, "test", "fixtures");

function fixtureFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...fixtureFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

const fixtures = fixtureFiles(fixtureRoot).sort((left, right) =>
  left.localeCompare(right),
);
if (fixtures.length === 0) {
  console.error(`No fixture files found under ${relative(root, fixtureRoot)}`);
  process.exit(1);
}

const executable = join(
  root,
  "node_modules",
  "tree-sitter-cli",
  process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter",
);
const libraryDirectory = mkdtempSync(join(tmpdir(), "tree-sitter-sed-fixtures-"));
const configPath = join(libraryDirectory, "config.json");
writeFileSync(
  configPath,
  `${JSON.stringify({ "parser-directories": [dirname(root)] }, null, 2)}\n`,
);
let result;
try {
  result = spawnSync(
    executable,
    [
      "parse",
      "-q",
      "--config-path",
      configPath,
      "--grammar-path",
      root,
      ...fixtures,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        LOCALAPPDATA: libraryDirectory,
        TREE_SITTER_DIR: libraryDirectory,
        TREE_SITTER_LIBDIR: libraryDirectory,
        XDG_CACHE_HOME: libraryDirectory,
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
} finally {
  rmSync(libraryDirectory, { recursive: true, force: true });
}

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error("Tree-sitter CLI is missing; run npm run setup:cli after npm ci.");
    process.exit(1);
  }
  throw result.error;
}
if (result.status === 0) {
  console.log(`Parsed ${fixtures.length} fixture file(s)`);
}
process.exit(result.status ?? 1);
