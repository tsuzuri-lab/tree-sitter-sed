const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const {
  replaceVerifiedExecutable,
} = require("../../scripts/install-tree-sitter");

function createPaths(t) {
  const directory = mkdtempSync(
    join(tmpdir(), "tree-sitter-sed-install-test-"),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  return {
    backupPath: join(directory, "tree-sitter.previous"),
    executablePath: join(directory, "tree-sitter"),
    stagedExecutable: join(directory, "tree-sitter.staged"),
  };
}

function contents(path) {
  return readFileSync(path, "utf8");
}

test("verifies a staged CLI before replacing the existing CLI", (t) => {
  const paths = createPaths(t);
  writeFileSync(paths.executablePath, "previous");
  writeFileSync(paths.stagedExecutable, "verified");
  const verifiedPaths = [];

  const output = replaceVerifiedExecutable({
    ...paths,
    verifyExecutable(path) {
      verifiedPaths.push(path);
      if (path === paths.stagedExecutable) {
        assert.equal(contents(paths.executablePath), "previous");
      }
      return contents(path);
    },
  });

  assert.equal(output, "verified");
  assert.deepEqual(verifiedPaths, [
    paths.stagedExecutable,
    paths.executablePath,
  ]);
  assert.equal(contents(paths.executablePath), "verified");
  assert.equal(existsSync(paths.backupPath), false);
});

test("leaves the existing CLI untouched when staged verification fails", (t) => {
  const paths = createPaths(t);
  writeFileSync(paths.executablePath, "previous");
  writeFileSync(paths.stagedExecutable, "invalid");

  assert.throws(
    () =>
      replaceVerifiedExecutable({
        ...paths,
        verifyExecutable() {
          throw new Error("invalid staged CLI");
        },
      }),
    /invalid staged CLI/,
  );

  assert.equal(contents(paths.executablePath), "previous");
  assert.equal(contents(paths.stagedExecutable), "invalid");
  assert.equal(existsSync(paths.backupPath), false);
});

test("restores the existing CLI when installed verification fails", (t) => {
  const paths = createPaths(t);
  writeFileSync(paths.executablePath, "previous");
  writeFileSync(paths.stagedExecutable, "verified");

  assert.throws(
    () =>
      replaceVerifiedExecutable({
        ...paths,
        verifyExecutable(path) {
          if (path === paths.executablePath) {
            throw new Error("installed CLI did not run");
          }
          return contents(path);
        },
      }),
    /installed CLI did not run/,
  );

  assert.equal(contents(paths.executablePath), "previous");
  assert.equal(existsSync(paths.stagedExecutable), false);
  assert.equal(existsSync(paths.backupPath), false);
});

test("removes a failed installation when there was no existing CLI", (t) => {
  const paths = createPaths(t);
  writeFileSync(paths.stagedExecutable, "verified");

  assert.throws(
    () =>
      replaceVerifiedExecutable({
        ...paths,
        verifyExecutable(path) {
          if (path === paths.executablePath) {
            throw new Error("installed CLI did not run");
          }
          return contents(path);
        },
      }),
    /installed CLI did not run/,
  );

  assert.equal(existsSync(paths.executablePath), false);
  assert.equal(existsSync(paths.stagedExecutable), false);
  assert.equal(existsSync(paths.backupPath), false);
});
