#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, dirname, join } = require("node:path");
const { gunzipSync } = require("node:zlib");
const { downloadVerified } = require("./download-verified");

const version = "0.26.11";

// These are the SHA-256 digests reported by GitHub's Release API for the
// v0.26.11 assets: https://github.com/tree-sitter/tree-sitter/releases/tag/v0.26.11
const assets = {
  "darwin-arm64": [
    "tree-sitter-macos-arm64.gz",
    "0bb646b2a29007233bd44855f00d0b8e238084d5b442f097d841b476318c2c90",
  ],
  "darwin-x64": [
    "tree-sitter-macos-x64.gz",
    "0da547d2622ba1583e4c748bb44db5b79af56462da41acf377b9fdc2eb2cd49f",
  ],
  "linux-arm": [
    "tree-sitter-linux-arm.gz",
    "5a23c5283124b0ad9f0111b354b7b1dd8d670a229162e8716333b8030756ff20",
  ],
  "linux-arm64": [
    "tree-sitter-linux-arm64.gz",
    "e47dd59bf2f21ad7c15771546a724464ee3c008a60fbb61c6860bd19a44b3060",
  ],
  "linux-ppc64": [
    "tree-sitter-linux-powerpc64.gz",
    "e27adb477f4e0a5d60fbf93b5e399553612047a27c9b4e1792e93ee11be2b56e",
  ],
  "linux-x64": [
    "tree-sitter-linux-x64.gz",
    "8dac3c89bb632eece700ea7a261ad963b251f2228c4aef3b58458ebea8dbe4eb",
  ],
  "linux-ia32": [
    "tree-sitter-linux-x86.gz",
    "6ae3f3f2fd84ae03c7c43198818f46e4dbeaf1c5cba791eed1c67a4a88c971a3",
  ],
  "win32-arm64": [
    "tree-sitter-windows-arm64.gz",
    "436c5fd1f1b999fedb6ba007c43f73bdfee01549a965420c0cee6a7f6c7f1a44",
  ],
  "win32-x64": [
    "tree-sitter-windows-x64.gz",
    "9d836a8c405ed50cea6b3410905576de3bff2b42ca12edc1e825ec86fe918a5f",
  ],
  "win32-ia32": [
    "tree-sitter-windows-x86.gz",
    "c5b0c37d2e9c98b52bd6b338b91e1b5f8872088dedd52e3f7fba5cec7811e6bf",
  ],
};

function verifyTreeSitterExecutable(path) {
  const result = spawnSync(path, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const expected = `tree-sitter ${version}`;

  if (result.error) {
    throw new Error(
      `Tree-sitter CLI version verification failed: ${result.error.message}`,
      { cause: result.error },
    );
  }
  if (
    result.status !== 0 ||
    (output !== expected && !output.startsWith(`${expected} `))
  ) {
    throw new Error(`Tree-sitter CLI version verification failed: ${output}`);
  }

  return output;
}

function replaceVerifiedExecutable({
  backupPath,
  executablePath,
  stagedExecutable,
  verifyExecutable,
}) {
  verifyExecutable(stagedExecutable);

  const hadPreviousExecutable = existsSync(executablePath);
  if (hadPreviousExecutable) {
    renameSync(executablePath, backupPath);
  }

  let output;
  try {
    renameSync(stagedExecutable, executablePath);
    output = verifyExecutable(executablePath);
  } catch (installError) {
    const recoveryErrors = [];
    try {
      rmSync(executablePath, { force: true });
    } catch (error) {
      recoveryErrors.push(error);
    }

    if (hadPreviousExecutable) {
      try {
        renameSync(backupPath, executablePath);
      } catch (error) {
        recoveryErrors.push(error);
      }
    }

    if (recoveryErrors.length > 0) {
      const recoveryFailure = hadPreviousExecutable
        ? "restore the previous executable"
        : "remove the failed executable";
      const backupLocation = existsSync(backupPath)
        ? `; the backup remains at ${backupPath}`
        : "";
      throw new AggregateError(
        [installError, ...recoveryErrors],
        `Failed to install the verified Tree-sitter CLI and ${recoveryFailure}${backupLocation}`,
      );
    }
    throw installError;
  }

  if (hadPreviousExecutable) {
    rmSync(backupPath, { force: true });
  }
  return output;
}

async function main() {
  const asset = assets[`${process.platform}-${process.arch}`];
  if (asset === undefined) {
    throw new Error(
      `No verified Tree-sitter CLI asset for ${process.platform}/${process.arch}`,
    );
  }

  const packageJsonPath = require.resolve("tree-sitter-cli/package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (packageJson.version !== version) {
    throw new Error(
      `Expected tree-sitter-cli ${version}, found ${packageJson.version}. Update the version and checksum table together.`,
    );
  }

  const packageDirectory = dirname(packageJsonPath);
  const executableName =
    process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter";
  const executablePath = join(packageDirectory, executableName);
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "tree-sitter-cli-"));
  const archivePath = join(temporaryDirectory, basename(asset[0]));
  const installationId = `${process.pid}-${randomUUID()}`;
  const stagedExecutable = join(
    packageDirectory,
    `${executableName}.verified-${installationId}`,
  );
  const backupPath = join(
    packageDirectory,
    `${executableName}.previous-${installationId}`,
  );

  try {
    const url = `https://github.com/tree-sitter/tree-sitter/releases/download/v${version}/${asset[0]}`;
    console.log(`Downloading ${url}`);
    await downloadVerified({
      url,
      destination: archivePath,
      sha256: asset[1],
      maxBytes: 64 * 1024 * 1024,
    });

    const executable = gunzipSync(readFileSync(archivePath), {
      maxOutputLength: 128 * 1024 * 1024,
    });
    writeFileSync(stagedExecutable, executable, { mode: 0o755 });
    chmodSync(stagedExecutable, 0o755);
    const output = replaceVerifiedExecutable({
      backupPath,
      executablePath,
      stagedExecutable,
      verifyExecutable: verifyTreeSitterExecutable,
    });

    console.log(`Installed ${output}; verified SHA-256 ${asset[1]}`);
  } finally {
    rmSync(stagedExecutable, { force: true });
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { replaceVerifiedExecutable, verifyTreeSitterExecutable };
