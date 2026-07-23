const { spawnSync } = require("node:child_process");
const {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");

const root = join(__dirname, "..", "..");
const executable = join(
  root,
  "node_modules",
  "tree-sitter-cli",
  process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter",
);
const cleanupOptions = {
  force: true,
  maxRetries: 3,
  recursive: true,
  retryDelay: 100,
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsSyntaxError(output) {
  return /^\s*\d+:\d+\s+-\s+\d+:\d+\s+(?:•)?(?:[A-Za-z_]\w*:\s+)?(?:•|(?:ERROR|MISSING)\b)/m.test(
    output,
  );
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
  const offset = starts[point.row];
  if (offset === undefined) {
    throw new Error(`CST point references missing row ${point.row}`);
  }
  return offset + point.column;
}

function nodeRanges(cst, name) {
  const pattern = new RegExp(
    `^\\s*(\\d+):(\\d+)\\s+-\\s*(\\d+):(\\d+)\\s+` +
      `(?:•)?(?:[A-Za-z_]\\w*:\\s+)?(?:•)?${escapeRegExp(name)}(?:\\s|$)`,
    "gm",
  );
  return [...cst.matchAll(pattern)].map((match) => ({
    start: { row: Number(match[1]), column: Number(match[2]) },
    end: { row: Number(match[3]), column: Number(match[4]) },
  }));
}

function nodeTexts(cst, source, name) {
  const sourceBuffer = Buffer.isBuffer(source)
    ? source
    : Buffer.from(source, "utf8");
  const starts = lineStarts(sourceBuffer);
  return nodeRanges(cst, name).map(({ start, end }) =>
    sourceBuffer
      .subarray(pointOffset(starts, start), pointOffset(starts, end))
      .toString("utf8"),
  );
}

function nodeCounts(cst, names) {
  return Object.fromEntries(
    names.map((name) => [name, nodeRanges(cst, name).length]),
  );
}

function createParserHarness(name) {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), `tree-sitter-sed-${name}-`),
  );
  const cacheDirectory = join(temporaryDirectory, "cache");
  const configDirectory = join(temporaryDirectory, "config");
  const treeSitterConfigDirectory = join(configDirectory, "tree-sitter");
  const configPath = join(treeSitterConfigDirectory, "config.json");
  let nextSourceId = 0;
  let closed = false;

  try {
    mkdirSync(cacheDirectory);
    mkdirSync(treeSitterConfigDirectory, { recursive: true });
    writeFileSync(
      configPath,
      `${JSON.stringify({ "parser-directories": [dirname(root)] }, null, 2)}\n`,
    );
  } catch (error) {
    rmSync(temporaryDirectory, cleanupOptions);
    throw error;
  }

  function parseSource(source, options = {}) {
    if (closed) {
      throw new Error("Parser harness is already closed");
    }

    const sourceBuffer = Buffer.isBuffer(source)
      ? source
      : Buffer.from(source, "utf8");
    const sourcePath = join(
      temporaryDirectory,
      `${String(nextSourceId).padStart(4, "0")}.sed`,
    );
    nextSourceId += 1;
    writeFileSync(sourcePath, sourceBuffer);

    const editArguments = (options.edits ?? []).flatMap(
      ({ byteOffset, deletedByteLength, text }) => [
        "--edits",
        `${byteOffset} ${deletedByteLength} ${text}`,
      ],
    );
    const result = spawnSync(
      executable,
      [
        "parse",
        "--cst",
        "--config-path",
        configPath,
        "--grammar-path",
        root,
        sourcePath,
        ...editArguments,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          APPDATA: configDirectory,
          LOCALAPPDATA: cacheDirectory,
          NO_COLOR: "1",
          TREE_SITTER_DIR: treeSitterConfigDirectory,
          TREE_SITTER_LIBDIR: cacheDirectory,
          XDG_CACHE_HOME: cacheDirectory,
          XDG_CONFIG_HOME: configDirectory,
        },
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      },
    );

    if (result.error) {
      if (result.error.code === "ENOENT") {
        throw new Error(
          "Tree-sitter CLI is missing; run npm run setup:cli after npm ci.",
        );
      }
      throw new Error(
        `Tree-sitter CLI could not parse ${options.name ?? "test input"}: ${result.error.message}`,
        { cause: result.error },
      );
    }
    if (result.signal !== null) {
      throw new Error(
        `Tree-sitter CLI was terminated by ${result.signal} while parsing ${options.name ?? "test input"}`,
      );
    }
    if (result.status === null) {
      throw new Error(
        `Tree-sitter CLI did not report an exit status for ${options.name ?? "test input"}`,
      );
    }

    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    const output = `${stdout}${stderr}`;
    const hasSyntaxError = containsSyntaxError(output);
    if (result.status !== 0 && !hasSyntaxError) {
      throw new Error(
        `Tree-sitter CLI exited with status ${result.status} while parsing ` +
          `${options.name ?? "test input"}${output.trim() ? `:\n${output.trim()}` : ""}`,
      );
    }

    return {
      exitCode: result.status,
      hasSyntaxError,
      output,
      source: sourceBuffer,
      stderr,
      stdout,
    };
  }

  function close() {
    if (!closed) {
      closed = true;
      rmSync(temporaryDirectory, cleanupOptions);
    }
  }

  return { close, parseSource };
}

module.exports = {
  createParserHarness,
  nodeCounts,
  nodeTexts,
};
