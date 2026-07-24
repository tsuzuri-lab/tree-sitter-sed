const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { applyEdits } = require("../support/source");
const {
  comparableCst,
  createParserHarness,
} = require("../support/tree-sitter");

const parser = createParserHarness("incremental-state");
after(() => parser.close());

function compareWithFullParse({ name, source, edits, hasSyntaxError }) {
  const editedSource = applyEdits(source, edits);
  const incremental = parser.parseSource(source, { edits, name });
  const full = parser.parseSource(editedSource, { name: `${name} (full)` });

  assert.deepEqual(
    {
      exitCode: incremental.exitCode,
      hasSyntaxError: incremental.hasSyntaxError,
    },
    {
      exitCode: full.exitCode,
      hasSyntaxError: full.hasSyntaxError,
    },
    incremental.output,
  );
  assert.equal(incremental.hasSyntaxError, hasSyntaxError, incremental.output);
  assert.equal(
    comparableCst(incremental.stdout),
    comparableCst(full.stdout),
    incremental.output,
  );
}

test("restores every delimited scanner mode after incremental edits", async (t) => {
  const cases = [
    {
      name: "edits a regex address body",
      source: "/ab/p\n",
      edits: [{ byteOffset: 2, deletedByteLength: 1, text: "xyz" }],
      hasSyntaxError: false,
    },
    {
      name: "edits a translate source",
      source: "y/ab/cd/\n",
      edits: [{ byteOffset: 2, deletedByteLength: 2, text: "xy" }],
      hasSyntaxError: false,
    },
    {
      name: "edits a translate destination",
      source: "y/ab/cd/\n",
      edits: [{ byteOffset: 5, deletedByteLength: 2, text: "XY" }],
      hasSyntaxError: false,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, () => compareWithFullParse(testCase));
  }
});

test("reclassifies replacement tokens after incremental edits", async (t) => {
  const cases = [
    {
      name: "changes a backreference to a case conversion",
      source: "s/a/\\1/\n",
      edits: [{ byteOffset: 5, deletedByteLength: 1, text: "L" }],
      hasSyntaxError: false,
    },
    {
      name: "changes a case conversion to an unspecified escape",
      source: "s/a/\\L/\n",
      edits: [{ byteOffset: 5, deletedByteLength: 1, text: "q" }],
      hasSyntaxError: false,
    },
    {
      name: "changes an unspecified escape to a backreference",
      source: "s/a/\\q/\n",
      edits: [{ byteOffset: 5, deletedByteLength: 1, text: "1" }],
      hasSyntaxError: false,
    },
    {
      name: "changes literal text to a whole-match reference",
      source: "s/a/x/\n",
      edits: [{ byteOffset: 4, deletedByteLength: 1, text: "&" }],
      hasSyntaxError: false,
    },
    {
      name: "changes a backreference into an escaped digit delimiter",
      source: "s/a/\\1/\n",
      edits: [
        { byteOffset: 1, deletedByteLength: 1, text: "1" },
        { byteOffset: 3, deletedByteLength: 1, text: "1" },
        { byteOffset: 6, deletedByteLength: 1, text: "1" },
      ],
      hasSyntaxError: false,
    },
    {
      name: "changes a case conversion into an escaped letter delimiter",
      source: "s/a/\\L/\n",
      edits: [
        { byteOffset: 1, deletedByteLength: 1, text: "L" },
        { byteOffset: 3, deletedByteLength: 1, text: "L" },
        { byteOffset: 6, deletedByteLength: 1, text: "L" },
      ],
      hasSyntaxError: false,
    },
    {
      name: "changes slash delimiters to ampersands",
      source: "s/a/\\&/\n",
      edits: [
        { byteOffset: 1, deletedByteLength: 1, text: "&" },
        { byteOffset: 3, deletedByteLength: 1, text: "&" },
        { byteOffset: 6, deletedByteLength: 1, text: "&" },
      ],
      hasSyntaxError: false,
    },
    {
      name: "changes slash delimiters to backslashes",
      source: "s/a/b/\n",
      edits: [
        { byteOffset: 1, deletedByteLength: 1, text: "\\" },
        { byteOffset: 3, deletedByteLength: 1, text: "\\" },
        { byteOffset: 5, deletedByteLength: 1, text: "\\" },
      ],
      hasSyntaxError: false,
    },
    {
      name: "changes slash delimiters to carriage returns",
      source: "s/a/b/\n",
      edits: [
        { byteOffset: 1, deletedByteLength: 1, text: "\r" },
        { byteOffset: 3, deletedByteLength: 1, text: "\r" },
        { byteOffset: 5, deletedByteLength: 1, text: "\r" },
      ],
      hasSyntaxError: false,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, () => compareWithFullParse(testCase));
  }
});

test("resets replacement token state at incomplete line endings", async (t) => {
  const cases = [
    {
      name: "reclassifies a token before end of file",
      source: "s/a/\\1",
      edits: [{ byteOffset: 5, deletedByteLength: 1, text: "L" }],
      hasSyntaxError: true,
    },
    {
      name: "reclassifies a token before LF",
      source: "s/a/\\1\np\n",
      edits: [{ byteOffset: 5, deletedByteLength: 1, text: "q" }],
      hasSyntaxError: true,
    },
    {
      name: "reclassifies a token before CRLF",
      source: "s/a/\\1\r\np\r\n",
      edits: [{ byteOffset: 5, deletedByteLength: 1, text: "q" }],
      hasSyntaxError: true,
    },
    {
      name: "replaces unterminated literal text with a trailing backslash",
      source: "s/a/x",
      edits: [{ byteOffset: 4, deletedByteLength: 1, text: "\\" }],
      hasSyntaxError: true,
    },
    {
      name: "escapes the closing replacement delimiter",
      source: "s/a/b/\np\n",
      edits: [{ byteOffset: 5, deletedByteLength: 0, text: "\\" }],
      hasSyntaxError: true,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, () => compareWithFullParse(testCase));
  }
});

test("updates text scanner modes and backslash parity after edits", async (t) => {
  const cases = [
    {
      name: "edits text after a backslash-newline introducer",
      source: "a\\\ntext\np\n",
      edits: [{ byteOffset: 3, deletedByteLength: 4, text: "body" }],
      hasSyntaxError: false,
    },
    {
      name: "edits text after a same-line backslash introducer",
      source: "a\\inline\np\n",
      edits: [{ byteOffset: 2, deletedByteLength: 6, text: "body" }],
      hasSyntaxError: false,
    },
    {
      name: "turns same-line text into backslash-newline text",
      source: "a\\x\np\n",
      edits: [{ byteOffset: 2, deletedByteLength: 1, text: "\n" }],
      hasSyntaxError: false,
    },
    {
      name: "turns backslash-newline text into same-line text",
      source: "a\\\n\np\n",
      edits: [{ byteOffset: 2, deletedByteLength: 1, text: "x" }],
      hasSyntaxError: false,
    },
    {
      name: "changes inline text from even to odd backslash parity",
      source: "a text\\\\\np\n",
      edits: [{ byteOffset: 8, deletedByteLength: 0, text: "\\" }],
      hasSyntaxError: false,
    },
    {
      name: "changes shell text from even to odd backslash parity",
      source: "e echo\\\\\np\n",
      edits: [{ byteOffset: 8, deletedByteLength: 0, text: "\\" }],
      hasSyntaxError: false,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, () => compareWithFullParse(testCase));
  }
});

test("commits zero-width recovery state across valid and malformed EOF edits", async (t) => {
  const cases = [
    {
      name: "completes an empty regex address",
      source: "/",
      edits: [{ byteOffset: 1, deletedByteLength: 0, text: "x/p" }],
      hasSyntaxError: false,
    },
    {
      name: "removes a complete substitute pattern and replacement",
      source: "s/a/b/",
      edits: [{ byteOffset: 2, deletedByteLength: 4, text: "" }],
      hasSyntaxError: true,
    },
    {
      name: "completes an empty substitute replacement",
      source: "s/a/",
      edits: [{ byteOffset: 4, deletedByteLength: 0, text: "b/" }],
      hasSyntaxError: false,
    },
    {
      name: "removes a complete translate source and destination",
      source: "y/a/b/",
      edits: [{ byteOffset: 2, deletedByteLength: 4, text: "" }],
      hasSyntaxError: true,
    },
    {
      name: "completes an empty translate destination",
      source: "y/a/",
      edits: [{ byteOffset: 4, deletedByteLength: 0, text: "b/" }],
      hasSyntaxError: false,
    },
    {
      name: "removes the final translate delimiter",
      source: "y/a/b/",
      edits: [{ byteOffset: 5, deletedByteLength: 1, text: "" }],
      hasSyntaxError: true,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, () => compareWithFullParse(testCase));
  }
});
