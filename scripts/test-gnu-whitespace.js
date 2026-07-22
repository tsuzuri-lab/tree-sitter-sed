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
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "tree-sitter-sed-gnu-whitespace-"),
);

const validCases = {
  "leading-control-whitespace.sed": {
    source: " \t\f \tp\n\t\v Q\n \r z\n",
    expected: { print_command: 1, silent_quit_command: 1, clear_command: 1 },
  },
  "after-semicolon.sed": {
    source: "p; \f \tQ\np;\t\v T done\np; \r z\n",
    expected: {
      print_command: 3,
      silent_quit_command: 1,
      test_failure_command: 1,
      clear_command: 1,
    },
  },
  "block-prefix.sed": {
    source: "{ \fp; \v Q}\n",
    expected: { block_command: 1, print_command: 1, silent_quit_command: 1 },
  },
  "crlf-boundary.sed": {
    source: "p\r\n\fq\r\n",
    expected: { print_command: 1, quit_command: 1 },
  },
  "control-characters-in-labels.sed": {
    source: ":\flabel\nb\flabel\nT\vother\n",
    expected: {
      label_command: 1,
      branch_command: 1,
      test_failure_command: 1,
      label: 3,
    },
  },
  "line-command-and-comment-prefix.sed": {
    source: "\fR input\n\v# comment\n",
    expected: {
      read_line_command: 1,
      file_argument: 1,
      comment_command: 1,
    },
  },
  "whitespace-only.sed": {
    source: "\f",
    expected: {},
  },
  "control-only-lines.sed": {
    source: "\f\np\n\v\nq\n\r",
    expected: { print_command: 1, quit_command: 1 },
  },
  "after-semicolon-without-command.sed": {
    source: "p;\f\nq;\v",
    expected: { print_command: 1, quit_command: 1 },
  },
  "mixed-semicolon-loop.sed": {
    source: "\f;\v;\r p\np;\f;\v;\r q\n",
    expected: { print_command: 2, quit_command: 1 },
  },
  "block-loop-whitespace.sed": {
    source: "{\f}\n{p;\f}\n{;\v}\n{\r\n}\n",
    expected: { block_command: 4, print_command: 1 },
  },
  "control-before-crlf.sed": {
    source: "\f\r\nq\n",
    expected: { quit_command: 1 },
  },
  "first-line-bare-cr.sed": {
    source: "#n\rp",
    expected: { first_line_silent: 1, print_command: 0 },
  },
};

const invalidCases = {
  "after-address.sed": "1\fp\n",
  "after-negation.sed": "!\fp\n",
  "after-command-at-eof.sed": "p\f",
  "before-line-ending.sed": "p\f\nq\n",
  "before-semicolon.sed": "p\f;\n",
  "before-right-brace.sed": "{p\f}\n",
  "before-comment.sed": "p\f# comment\n",
  "before-quit-status.sed": "q\f1\n",
  "after-address-comma.sed": "1,\f2p\n",
  "invalid-escaped-regex-fallthrough.sed": "\\\rp\n",
};

const incrementalCases = {
  "insert-command-prefix.sed": {
    source: "p\n",
    edits: ["0 0 \f"],
    expected: { print_command: 1 },
  },
  "insert-after-semicolon.sed": {
    source: "p;\nq\n",
    edits: ["2 0 \f"],
    expected: { print_command: 1, quit_command: 1 },
  },
  "insert-before-block-close.sed": {
    source: "{p;}\n",
    edits: ["3 0 \v"],
    expected: { block_command: 1, print_command: 1 },
  },
};

function countNodes(cst, name) {
  return (
    cst.match(new RegExp(`^\\s*(?:\\w+:\\s+)?${name}(?:\\s|$)`, "gm"))
      ?.length ?? 0
  );
}

function parse(path, configPath, cacheDirectory, edits = []) {
  const editArguments = edits.flatMap((edit) => ["--edits", edit]);
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
      ...editArguments,
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

  return {
    ...result,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function hasSyntaxError(result) {
  return (
    result.status !== 0 ||
    /^\s*(?:\w+:\s+)?(?:ERROR|MISSING)(?:\s|$)/m.test(result.output)
  );
}

function assertValidResult(name, result, expected) {
  if (hasSyntaxError(result)) {
    throw new Error(
      `${name} failed to parse${result.output.trim() ? `:\n${result.output.trim()}` : ""}`,
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

try {
  const cacheDirectory = join(temporaryDirectory, "cache");
  const configPath = join(temporaryDirectory, "config.json");
  mkdirSync(cacheDirectory);
  writeFileSync(
    configPath,
    `${JSON.stringify({ "parser-directories": [dirname(root)] }, null, 2)}\n`,
  );

  for (const [name, { source, expected }] of Object.entries(validCases)) {
    const path = join(temporaryDirectory, name);
    writeFileSync(path, source, "utf8");
    const result = parse(path, configPath, cacheDirectory);
    assertValidResult(name, result, expected);
  }

  for (const [name, source] of Object.entries(invalidCases)) {
    const path = join(temporaryDirectory, name);
    writeFileSync(path, source, "utf8");
    const result = parse(path, configPath, cacheDirectory);

    if (!hasSyntaxError(result)) {
      throw new Error(`${name} unexpectedly parsed without an error`);
    }
  }

  for (const [name, { source, edits, expected }] of Object.entries(
    incrementalCases,
  )) {
    const path = join(temporaryDirectory, name);
    writeFileSync(path, source, "utf8");
    const result = parse(path, configPath, cacheDirectory, edits);
    assertValidResult(name, result, expected);
  }

  console.log(
    `Verified ${Object.keys(validCases).length} GNU command-loop whitespace ` +
      `fixtures, ${Object.keys(invalidCases).length} invalid placements, and ` +
      `${Object.keys(incrementalCases).length} incremental edits`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
