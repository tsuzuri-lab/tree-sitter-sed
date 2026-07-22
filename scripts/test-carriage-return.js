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
  join(tmpdir(), "tree-sitter-sed-carriage-return-"),
);
const backslash = "\\";

const validCases = {
  "comment-data.sed": {
    source: "#x\rnot-a-command\np\n",
    expected: {
      comment_command: ["#x\rnot-a-command"],
      print_command: ["p"],
    },
  },
  "diagnostic-words-are-comment-data.sed": {
    source: "# ERROR • MISSING\rdata\np\n",
    expected: {
      comment_command: ["# ERROR • MISSING\rdata"],
      print_command: ["p"],
    },
  },
  "label-data.sed": {
    source: "bfoo\rp\n:foo\rp\n",
    expected: { label: ["foo\rp", "foo\rp"] },
  },
  "label-leading-data.sed": {
    source: "b\rfoo\n:\rfoo\n",
    expected: { label: ["\rfoo", "\rfoo"] },
  },
  "version-data.sed": {
    source: "v4.0\rpreview\np\n",
    expected: {
      version_argument: ["4.0\rpreview"],
      print_command: ["p"],
    },
  },
  "file-data.sed": {
    source: "r file\rname\nR \rinput\np\n",
    expected: {
      file_argument: ["file\rname", "\rinput"],
      print_command: ["p"],
    },
  },
  "write-file-data.sed": {
    source: "s/a/b/w out\rname\np\n",
    expected: {
      file_argument: ["out\rname"],
      print_command: ["p"],
    },
  },
  "shell-data.sed": {
    source: "e echo\rdate\np\n",
    expected: {
      shell_command: ["echo\rdate"],
      print_command: ["p"],
    },
  },
  "shell-legacy-data.sed": {
    source: "e\\\rcmd\np\n",
    expected: {
      shell_command: ["\\\rcmd"],
      print_command: ["p"],
    },
  },
  "shell-backslash-bare-cr-data.sed": {
    source: "e echo\\\rdate\np\n",
    expected: {
      shell_command: ["echo\\\rdate"],
      print_command: ["p"],
    },
  },
  "inline-text-data.sed": {
    source: "a hello\rworld\np\n",
    expected: {
      text_block: ["hello\rworld"],
      print_command: ["p"],
    },
  },
  "backslash-text-leadin-data.sed": {
    source: "a\\\rhello\np\n",
    expected: {
      text_block: ["\rhello"],
      print_command: ["p"],
    },
  },
  "backslash-text-body-data.sed": {
    source: "a\\\nhello\rworld\np\n",
    expected: {
      text_block: ["hello\rworld"],
      print_command: ["p"],
    },
  },
  "text-backslash-bare-cr-data.sed": {
    source: "a hello\\\rworld\np\n",
    expected: {
      text_block: ["hello\\\rworld"],
      print_command: ["p"],
    },
  },
  "regex-data.sed": {
    source: "/a\rb/p\n\\|c\rd|p\n/[a\rb]/p\n",
    expected: {
      regex_content: ["a\rb", "c\rd", "[a\rb]"],
      print_command: ["p", "p", "p"],
    },
  },
  "substitute-data.sed": {
    source: "s/\ra/\rb/\ns/a\\\rb/c\rd/\n",
    expected: {
      regex_content: ["\ra", "a\\\rb"],
      replacement: ["\rb", "c\rd"],
    },
  },
  "replacement-backslash-bare-cr-data.sed": {
    source: "s/a/b\\\rc/\n",
    expected: {
      regex_content: ["a"],
      replacement: ["b\\\rc"],
    },
  },
  "translate-data.sed": {
    source: "y/\ra/\rb/\ny/a\rb/c\rd/\n",
    expected: {
      translate_source: ["\ra", "a\rb"],
      translate_destination: ["\rb", "c\rd"],
    },
  },
  "comment-eof.sed": {
    source: "#x\r",
    expected: { comment_command: ["#x\r"] },
  },
  "label-eof.sed": {
    source: ":x\r",
    expected: { label: ["x\r"] },
  },
  "file-eof.sed": {
    source: "r file\r",
    expected: { file_argument: ["file\r"] },
  },
  "shell-eof.sed": {
    source: "e echo\r",
    expected: { shell_command: ["echo\r"] },
  },
  "text-eof.sed": {
    source: "a text\r",
    expected: { text_block: ["text\r"] },
  },
  "double-cr-before-crlf.sed": {
    source: "#x\r\r\np\n",
    expected: {
      comment_command: ["#x\r"],
      print_command: ["p"],
      separator: ["\r\n", "\n"],
    },
  },
  "crlf-boundaries.sed": {
    source: "#x\r\nbfoo\r\nr file\r\ne echo\r\na text\r\np\n",
    expected: {
      comment_command: ["#x"],
      label: ["foo"],
      file_argument: ["file"],
      shell_command: ["echo"],
      text_block: ["text"],
      print_command: ["p"],
      separator: ["\r\n", "\r\n", "\r\n", "\r\n", "\r\n", "\n"],
    },
  },
  "owned-token-priority.sed": {
    source:
      "p\n#n\rcomment\nr #file\rname\ne #shell\rdata\nb#comment\nv\v4\nb\r\nq\n",
    expected: {
      first_line_silent: [],
      comment_command: ["#n\rcomment", "#comment"],
      file_argument: ["#file\rname"],
      shell_command: ["#shell\rdata"],
      version_argument: ["\v4"],
      branch_command: ["b", "b"],
      print_command: ["p"],
      quit_command: ["q"],
    },
  },
  "cr-delimited-substitute.sed": {
    source: "s\ra\rb\r\np\n",
    expected: {
      substitute_command: ["s\ra\rb\r"],
      regex_content: ["a"],
      replacement: ["b"],
      print_command: ["p"],
      separator: ["\n", "\n"],
    },
  },
  "cr-delimited-translate.sed": {
    source: "y\ra\rb\r\np\n",
    expected: {
      translate_command: ["y\ra\rb\r"],
      translate_source: ["a"],
      translate_destination: ["b"],
      print_command: ["p"],
    },
  },
  "cr-delimited-address.sed": {
    source: "\\\ra\rp\n",
    expected: {
      regex: ["\\\ra\r"],
      regex_content: ["a"],
      print_command: ["p"],
    },
  },
  "escaped-cr-delimiter-data.sed": {
    source:
      "s\ra\\\rb\rc\r\ns\ra\rb\\\rc\r\ny\ra\\\rb\rc\r\ny\ra\rb\\\rc\r\n\\\ra\\\rb\rp\n",
    expected: {
      regex_content: ["a\\\rb", "a", "a\\\rb"],
      replacement: ["c", "b\\\rc"],
      translate_source: ["a\\\rb", "a"],
      translate_destination: ["c", "b\\\rc"],
      print_command: ["p"],
    },
  },
  "backslash-delimited-substitute.sed": {
    source: `s${backslash}a${backslash}b${backslash}\np\n`,
    expected: {
      substitute_command: [`s${backslash}a${backslash}b${backslash}`],
      regex_content: ["a"],
      replacement: ["b"],
      print_command: ["p"],
    },
  },
  "backslash-delimited-translate.sed": {
    source: `y${backslash}a${backslash}b${backslash}\np\n`,
    expected: {
      translate_command: [`y${backslash}a${backslash}b${backslash}`],
      translate_source: ["a"],
      translate_destination: ["b"],
      print_command: ["p"],
    },
  },
  "backslash-delimited-address.sed": {
    source: `${backslash}${backslash}a${backslash}p\n`,
    expected: {
      regex: [`${backslash}${backslash}a${backslash}`],
      regex_content: ["a"],
      print_command: ["p"],
    },
  },
};

const invalidCases = {
  "command-separator.sed": "p\rq\ns/z/Z/\n",
  "quit-status.sed": "q\r1\ns/z/Z/\n",
  "address-command.sed": "1\rp\ns/z/Z/\n",
  "negation-command.sed": "!\rp\ns/z/Z/\n",
  "regex-command.sed": "/a/\rp\ns/z/Z/\n",
  "substitute-flags.sed": "s/a/b/\rp\ns/z/Z/\n",
  "pattern-crlf-boundary.sed": "s/a\r\np\ns/z/Z/\n",
  "replacement-crlf-boundary.sed": "s/a/b\r\np\ns/z/Z/\n",
  "translate-crlf-boundary.sed": "y/a\r\np\ns/z/Z/\n",
  "unterminated-pattern-with-data.sed": "s/a\rb\np\ns/z/Z/\n",
  "cr-delimiter-pattern-crlf.sed":
    "s\ra\\\r\nb\rc\r\ns/z/Z/\n",
  "cr-delimiter-replacement-crlf.sed":
    "s\ra\rb\\\r\nc\r\ns/z/Z/\n",
  "cr-delimiter-translate-source-crlf.sed":
    "y\ra\\\r\nb\rc\r\ns/z/Z/\n",
  "cr-delimiter-translate-destination-crlf.sed":
    "y\ra\rb\\\r\nc\r\ns/z/Z/\n",
};

const incrementalCases = {
  "insert-comment-data.sed": {
    source: "#x\nq\n",
    edits: [{ position: 2, deletedLength: 0, text: "\rp" }],
    expected: {
      comment_command: ["#x\rp"],
      print_command: [],
      quit_command: ["q"],
    },
  },
  "insert-label-data.sed": {
    source: "bfoo\n:foo\n",
    edits: [{ position: 4, deletedLength: 0, text: "\rp" }],
    expected: { label: ["foo\rp", "foo"] },
  },
  "insert-pattern-data.sed": {
    source: "s/ab/cd/\n",
    edits: [{ position: 3, deletedLength: 0, text: "\r" }],
    expected: {
      regex_content: ["a\rb"],
      replacement: ["cd"],
    },
  },
  "insert-replacement-data.sed": {
    source: "s/ab/cd/\n",
    edits: [{ position: 6, deletedLength: 0, text: "\r" }],
    expected: {
      regex_content: ["ab"],
      replacement: ["c\rd"],
    },
  },
  "bare-to-crlf.sed": {
    source: "#x\rp\nq\n",
    edits: [{ position: 3, deletedLength: 0, text: "\n" }],
    expected: {
      comment_command: ["#x"],
      print_command: ["p"],
      quit_command: ["q"],
    },
  },
  "crlf-to-bare.sed": {
    source: "#x\r\np\nq\n",
    edits: [{ position: 3, deletedLength: 1, text: "" }],
    expected: {
      comment_command: ["#x\rp"],
      print_command: [],
      quit_command: ["q"],
    },
  },
  "replace-with-cr-delimiters.sed": {
    source: "s/a/b/\np\n",
    edits: [
      { position: 1, deletedLength: 1, text: "\r" },
      { position: 3, deletedLength: 1, text: "\r" },
      { position: 5, deletedLength: 1, text: "\r" },
    ],
    expected: {
      substitute_command: ["s\ra\rb\r"],
      print_command: ["p"],
    },
  },
  "regex-bare-to-crlf.sed": {
    source: "s/a\\\rb/c/\n",
    edits: [{ position: 5, deletedLength: 0, text: "\n" }],
    expected: {
      regex_content: ["a\\\r\nb"],
      replacement: ["c"],
    },
  },
  "regex-crlf-to-bare.sed": {
    source: "s/a\\\r\nb/c/\n",
    edits: [{ position: 5, deletedLength: 1, text: "" }],
    expected: {
      regex_content: ["a\\\rb"],
      replacement: ["c"],
    },
  },
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nodeRanges(cst, name) {
  const escaped = escapeRegExp(name);
  const pattern = new RegExp(
    `^\\s*(\\d+):(\\d+)\\s+-\\s*(\\d+):(\\d+)\\s+` +
      `(?:•)?(?:[A-Za-z_]\\w*:\\s+)?(?:•)?${escaped}(?:\\s|$)`,
    "gm",
  );
  return [...cst.matchAll(pattern)].map((match) => ({
    start: { row: Number(match[1]), column: Number(match[2]) },
    end: { row: Number(match[3]), column: Number(match[4]) },
  }));
}

function lineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === 0x0a) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function pointOffset(starts, point) {
  const start = starts[point.row];
  if (start === undefined) {
    throw new Error(`CST point references missing row ${point.row}`);
  }
  return start + point.column;
}

function nodeSlices(cst, source, name) {
  const starts = lineStarts(source);
  return nodeRanges(cst, name).map(({ start, end }) =>
    source.subarray(pointOffset(starts, start), pointOffset(starts, end)));
}

function formatBytes(value) {
  return JSON.stringify(value.toString("utf8"));
}

function assertNodeSlices(name, cst, source, expected) {
  for (const [node, expectedValues] of Object.entries(expected)) {
    const actual = nodeSlices(cst, source, node);
    if (actual.length !== expectedValues.length) {
      throw new Error(
        `${name} expected ${expectedValues.length} ${node} node(s), received ` +
          `${actual.length}:\n${cst}`,
      );
    }

    for (let index = 0; index < expectedValues.length; index += 1) {
      const expectedBuffer = Buffer.from(expectedValues[index], "utf8");
      if (!actual[index].equals(expectedBuffer)) {
        throw new Error(
          `${name} expected ${node}[${index}] ${formatBytes(expectedBuffer)}, ` +
            `received ${formatBytes(actual[index])}:\n${cst}`,
        );
      }
    }
  }
}

function containsNodeSlice(cst, source, node, expected) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  return nodeSlices(cst, source, node).some((actual) =>
    actual.equals(expectedBuffer));
}

function parse(path, configPath, cacheDirectory, edits = []) {
  const editArguments = edits.flatMap(({ position, deletedLength, text }) => [
    "--edits",
    `${position} ${deletedLength} ${text}`,
  ]);
  const result = spawnSync(
    executable,
    [
      "parse",
      "--cst",
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
    /^\s*\d+:\d+\s+-\s+\d+:\d+\s+(?:•)?(?:[A-Za-z_]\w*:\s+)?(?:•|(?:ERROR|MISSING)\b)/m.test(
      result.output,
    )
  );
}

function applyEdits(source, edits) {
  let result = Buffer.from(source, "utf8");
  for (const { position, deletedLength, text } of edits) {
    result = Buffer.concat([
      result.subarray(0, position),
      Buffer.from(text, "utf8"),
      result.subarray(position + deletedLength),
    ]);
  }
  return result;
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
    const sourceBuffer = Buffer.from(source, "utf8");
    writeFileSync(path, sourceBuffer);
    const result = parse(path, configPath, cacheDirectory);
    if (hasSyntaxError(result)) {
      throw new Error(
        `${name} failed to parse${result.output.trim() ? `:\n${result.output.trim()}` : ""}`,
      );
    }
    assertNodeSlices(name, result.stdout ?? "", sourceBuffer, expected);
  }

  for (const [name, source] of Object.entries(invalidCases)) {
    const path = join(temporaryDirectory, name);
    const sourceBuffer = Buffer.from(source, "utf8");
    writeFileSync(path, sourceBuffer);
    const result = parse(path, configPath, cacheDirectory);
    if (!hasSyntaxError(result)) {
      throw new Error(
        `${name} unexpectedly parsed without an error:\n${result.output}`,
      );
    }
    if (
      !containsNodeSlice(
        result.stdout ?? "",
        sourceBuffer,
        "substitute_command",
        "s/z/Z/",
      )
    ) {
      throw new Error(
        `${name} did not recover at the final substitute command:\n${result.stdout}`,
      );
    }
  }

  for (const [name, { source, edits, expected }] of Object.entries(
    incrementalCases,
  )) {
    const path = join(temporaryDirectory, name);
    writeFileSync(path, source, "utf8");
    const result = parse(path, configPath, cacheDirectory, edits);
    if (hasSyntaxError(result)) {
      throw new Error(
        `${name} incremental parse failed${result.output.trim() ? `:\n${result.output.trim()}` : ""}`,
      );
    }
    assertNodeSlices(
      name,
      result.stdout ?? "",
      applyEdits(source, edits),
      expected,
    );
  }

  console.log(
    `Verified ${Object.keys(validCases).length} carriage-return fixtures, ` +
      `${Object.keys(invalidCases).length} invalid boundaries, and ` +
      `${Object.keys(incrementalCases).length} incremental edits`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
