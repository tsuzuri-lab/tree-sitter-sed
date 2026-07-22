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
const temporaryDirectory = mkdtempSync(join(tmpdir(), "tree-sitter-sed-crlf-"));

const cases = {
  "commands-and-block.sed": {
    lines: ["#n", "1,3p", "{", "  /x/d", "  }", "p", ""],
    expectedNodeCounts: {
      first_line_silent: 1,
      block_command: 1,
      delete_command: 1,
      print_command: 2,
      regex_address: 1,
      regex_content: 1,
    },
  },
  "empty-text.sed": {
    lines: ["a\\", "", "p", ""],
    expectedNodeCounts: {
      append_command: 1,
      text_block: 1,
      print_command: 1,
    },
  },
  "continued-text.sed": {
    lines: ["i\\", "first\\", "second", "p", ""],
    expectedNodeCounts: {
      insert_command: 1,
      text_block: 1,
      print_command: 1,
    },
  },
  "even-backslashes.sed": {
    lines: ["c\\", "ends with \\\\", "p", ""],
    expectedNodeCounts: {
      change_command: 1,
      text_block: 1,
      print_command: 1,
    },
  },
  "continued-replacement.sed": {
    lines: ["s/a/b\\", "c/p", ""],
    expectedNodeCounts: {
      substitute_command: 1,
      regex_content: 1,
      replacement: 1,
      print_flag: 1,
    },
  },
  "continued-operands.sed": {
    lines: [
      "/foo\\",
      "bar/p",
      "s/foo\\",
      "bar/replacement/p",
      "y/ab\\",
      "c/AB\\",
      "C/",
      "",
    ],
    expectedNodeCounts: {
      regex_address: 1,
      substitute_command: 1,
      translate_command: 1,
      regex_content: 2,
      replacement: 1,
      translate_source: 1,
      translate_destination: 1,
      print_command: 1,
      print_flag: 1,
    },
  },
  "gnu-addresses.sed": {
    lines: [
      "0~2p",
      "50~0p",
      "1,+3p",
      "/x/,+2p",
      "/x/,~4p",
      "/x/IMp",
      "",
    ],
    expectedNodeCounts: {
      print_command: 6,
      periodic_address: 2,
      step_value: 3,
      relative_address: 2,
      next_multiple_address: 1,
      line_offset: 2,
      regex_flags: 1,
      regex_address: 3,
      regex_content: 3,
      ignore_case_flag: 1,
      multiline_flag: 1,
    },
  },
  "gnu-commands.sed": {
    lines: [
      "Q 7",
      "1,2F",
      "T done;z",
      "R input.txt",
      "W output.txt",
      "v 4.0",
      "e echo hi",
      "",
    ],
    expectedNodeCounts: {
      silent_quit_command: 1,
      exit_status: 1,
      file_name_command: 1,
      test_failure_command: 1,
      clear_command: 1,
      read_line_command: 1,
      write_first_line_command: 1,
      version_command: 1,
      version_argument: 1,
      file_argument: 2,
      execute_command: 1,
      shell_command: 1,
    },
  },
  "gnu-inline-text.sed": {
    lines: ["1,2a inline", "i", "p", "c\\", "text", "p", ""],
    expectedNodeCounts: {
      append_command: 1,
      insert_command: 1,
      change_command: 1,
      text_block: 3,
      print_command: 2,
    },
  },
  "gnu-inline-continuation.sed": {
    lines: ["a inline\\", "continued", "p", "a inline\\\\", "p", ""],
    expectedNodeCounts: {
      append_command: 2,
      text_block: 2,
      print_command: 2,
    },
  },
  "gnu-execute-continuation.sed": {
    lines: ["e echo one\\", "two", "p", ""],
    expectedNodeCounts: {
      execute_command: 1,
      shell_command: 1,
      print_command: 1,
    },
  },
  "gnu-substitution.sed": {
    lines: ["s/a/b/IMe", "s/a/b/g w output;#}", "p", ""],
    expectedNodeCounts: {
      substitute_command: 2,
      regex_content: 2,
      replacement: 2,
      print_command: 1,
      ignore_case_flag: 1,
      multiline_flag: 1,
      execute_flag: 1,
      global_flag: 1,
      write_flag: 1,
      file_argument: 1,
    },
  },
  "gnu-line-consuming.sed": {
    lines: ["R input;#}", "e echo;#}", "a inline;#}", "p", ""],
    expectedNodeCounts: {
      append_command: 1,
      text_block: 1,
      print_command: 1,
      read_line_command: 1,
      file_argument: 1,
      execute_command: 1,
      shell_command: 1,
    },
  },
};

const trackedNodes = [
  ...new Set(
    Object.values(cases).flatMap(({ expectedNodeCounts }) =>
      Object.keys(expectedNodeCounts)),
  ),
];

function countNodes(cst, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    cst.match(new RegExp(`^\\s*(?:\\w+:\\s+)?${escaped}(?:\\s|$)`, "gm"))
      ?.length ?? 0
  );
}

try {
  const fixturePaths = new Map();
  for (const [name, { lines }] of Object.entries(cases)) {
    const source = lines.join("\r\n");
    const path = join(temporaryDirectory, name);
    writeFileSync(path, source, "utf8");
    fixturePaths.set(name, path);
  }

  const cacheDirectory = join(temporaryDirectory, "cache");
  const configPath = join(temporaryDirectory, "config.json");
  mkdirSync(cacheDirectory);
  writeFileSync(
    configPath,
    `${JSON.stringify({ "parser-directories": [dirname(root)] }, null, 2)}\n`,
  );

  const parseEnvironment = {
    ...process.env,
    LOCALAPPDATA: cacheDirectory,
    NO_COLOR: "1",
    TREE_SITTER_DIR: temporaryDirectory,
    TREE_SITTER_LIBDIR: cacheDirectory,
    XDG_CACHE_HOME: cacheDirectory,
  };

  for (const [name, { expectedNodeCounts }] of Object.entries(cases)) {
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
        fixturePaths.get(name),
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: parseEnvironment,
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
        `CRLF fixture ${name} failed to parse${output.trim() ? `:\n${output.trim()}` : ""}`,
      );
    }

    for (const node of trackedNodes) {
      const expected = expectedNodeCounts[node] ?? 0;
      const actual = countNodes(result.stdout ?? "", node);
      if (actual !== expected) {
        throw new Error(
          `CRLF fixture ${name} expected ${expected} ${node} node(s), received ${actual}:\n${result.stdout}`,
        );
      }
    }
  }

  console.log(
    `Individually parsed and verified ${Object.keys(cases).length} CRLF regression fixtures`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
