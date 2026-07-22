#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");

const root = join(__dirname, "..");
const executable = join(
  root,
  "node_modules",
  "tree-sitter-cli",
  process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter",
);
const temporaryDirectory = mkdtempSync(join(tmpdir(), "tree-sitter-sed-eof-"));

const cases = {
  "blanks-only.sed": {
    source: " \t  ",
    expected: {},
  },
  "command.sed": {
    source: "p   ",
    expected: { print_command: 1 },
  },
  "label.sed": {
    source: ":done\t  ",
    expected: { label_command: 1, label: 1 },
  },
  "substitution.sed": {
    source: "s/a/b/p   ",
    expected: { substitute_command: 1, print_flag: 1 },
  },
  "block.sed": {
    source: "{p}\t ",
    expected: { block_command: 1, print_command: 1 },
  },
  "version.sed": {
    source: "v 4.0   ",
    expected: { version_command: 1, version_argument: 1 },
  },
  "execute.sed": {
    source: "e   ",
    expected: { execute_command: 1 },
  },
};

function countNodes(cst, name) {
  return (
    cst.match(new RegExp(`^\\s*(?:\\w+:\\s+)?${name}(?:\\s|$)`, "gm"))
      ?.length ?? 0
  );
}

try {
  const cacheDirectory = join(temporaryDirectory, "cache");
  const configPath = join(temporaryDirectory, "config.json");
  mkdirSync(cacheDirectory);
  writeFileSync(
    configPath,
    `${JSON.stringify({ "parser-directories": [dirname(root)] }, null, 2)}\n`,
  );

  for (const [name, { source, expected }] of Object.entries(cases)) {
    const path = join(temporaryDirectory, name);
    writeFileSync(path, source, "utf8");

    const result = spawnSync(
      executable,
      [
        "parse",
        "--cst",
        "--no-ranges",
        "--config-path",
        configPath,
        "--grammar-path",
        root,
        path,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          LOCALAPPDATA: cacheDirectory,
          NO_COLOR: "1",
          TREE_SITTER_DIR: temporaryDirectory,
          TREE_SITTER_LIBDIR: cacheDirectory,
          XDG_CACHE_HOME: cacheDirectory,
        },
        windowsHide: true,
      },
    );

    if (result.error) {
      if (result.error.code === "ENOENT") {
        throw new Error(
          "Tree-sitter CLI is missing; run npm run setup:cli after npm ci.",
        );
      }
      throw result.error;
    }

    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (
      result.status !== 0 ||
      /^\s*(?:\w+:\s+)?(?:ERROR|MISSING)(?:\s|$)/m.test(output)
    ) {
      throw new Error(
        `${name} failed to parse at EOF${output.trim() ? `:\n${output.trim()}` : ""}`,
      );
    }

    for (const [node, expectedCount] of Object.entries(expected)) {
      const actualCount = countNodes(result.stdout ?? "", node);
      if (actualCount !== expectedCount) {
        throw new Error(
          `${name} expected ${expectedCount} ${node} node(s), received ` +
            `${actualCount}:\n${result.stdout}`,
        );
      }
    }
  }

  console.log(
    `Parsed and verified ${Object.keys(cases).length} no-final-newline fixtures`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
