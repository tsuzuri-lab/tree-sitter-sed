const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join, relative } = require("node:path");
const { after, test } = require("node:test");
const { createParserHarness } = require("../support/tree-sitter");

const root = join(__dirname, "..", "..");
const fixtureRoot = join(root, "test", "fixtures");
const expectedFixturePaths = [
  join(fixtureRoot, "gnu.sed"),
  join(fixtureRoot, "posix.sed"),
  join(fixtureRoot, "regex-delimiters.sed"),
];
const parser = createParserHarness("fixtures");
after(() => parser.close());

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

test("parses every complete sed fixture without a syntax error", async (t) => {
  const fixtures = fixtureFiles(fixtureRoot).sort((left, right) =>
    left.localeCompare(right),
  );

  assert.deepEqual(fixtures, expectedFixturePaths);

  for (const path of fixtures) {
    const name = relative(root, path);
    await t.test(name, () => {
      const result = parser.parseSource(readFileSync(path), { name });

      assert.deepEqual(
        {
          exitCode: result.exitCode,
          hasSyntaxError: result.hasSyntaxError,
        },
        {
          exitCode: 0,
          hasSyntaxError: false,
        },
        result.output,
      );
    });
  }
});
