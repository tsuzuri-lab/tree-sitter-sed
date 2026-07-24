const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { createParserHarness, nodeTexts } = require("../support/tree-sitter");

const parser = createParserHarness("replacement-tokens");
after(() => parser.close());

function assertReplacementTokens(source, expected, name) {
  const result = parser.parseSource(source, { name });

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
  assert.deepEqual(
    {
      matchReference: nodeTexts(
        result.stdout,
        result.source,
        "match_reference",
      ),
      backreference: nodeTexts(result.stdout, result.source, "backreference"),
      escapeSequence: nodeTexts(
        result.stdout,
        result.source,
        "escape_sequence",
      ),
      caseConversion: nodeTexts(
        result.stdout,
        result.source,
        "case_conversion",
      ),
    },
    expected,
    result.output,
  );
}

test("exposes portable replacement references and escapes", () => {
  assertReplacementTokens(
    "s/a/literal&-\\1-\\&-\\\\-\\/-\\q-\\10/\n",
    {
      matchReference: ["&"],
      backreference: ["\\1", "\\1"],
      escapeSequence: ["\\&", "\\\\", "\\/", "\\q"],
      caseConversion: [],
    },
    "portable replacement references and escapes",
  );
});

test("exposes GNU replacement case conversions", () => {
  assertReplacementTokens(
    "s/a/\\L&\\E-\\u\\1\\lX\\U/\n",
    {
      matchReference: ["&"],
      backreference: ["\\1"],
      escapeSequence: [],
      caseConversion: ["\\L", "\\E", "\\u", "\\l", "\\U"],
    },
    "GNU replacement case conversions",
  );
});

test("resumes operator recognition after an escaped backslash", () => {
  assertReplacementTokens(
    "s/a/\\\\1-\\\\L-\\\\&/\n",
    {
      matchReference: ["&"],
      backreference: [],
      escapeSequence: ["\\\\", "\\\\", "\\\\"],
      caseConversion: [],
    },
    "operators after escaped backslashes",
  );
});

test("keeps escaped physical line endings as escape sequences", async (t) => {
  const cases = [
    {
      name: "escaped LF",
      source: "s/a/one\\\ntwo/\n",
      escapeSequence: ["\\\n"],
    },
    {
      name: "escaped CRLF",
      source: "s/a/one\\\r\ntwo/\r\n",
      escapeSequence: ["\\\r\n"],
    },
    {
      name: "escaped bare carriage return",
      source: "s/a/one\\\rtwo/\n",
      escapeSequence: ["\\\r"],
    },
  ];

  for (const { name, source, escapeSequence } of cases) {
    await t.test(name, () =>
      assertReplacementTokens(
        source,
        {
          matchReference: [],
          backreference: [],
          escapeSequence,
          caseConversion: [],
        },
        name,
      ),
    );
  }
});

test("gives escaped delimiters precedence over replacement operators", async (t) => {
  const cases = [
    {
      name: "digit delimiter",
      source: "s1a1\\11\n",
      expected: {
        matchReference: [],
        backreference: [],
        escapeSequence: ["\\1"],
        caseConversion: [],
      },
    },
    {
      name: "case-conversion delimiter",
      source: "sLaL\\LL\n",
      expected: {
        matchReference: [],
        backreference: [],
        escapeSequence: ["\\L"],
        caseConversion: [],
      },
    },
    {
      name: "ampersand delimiter",
      source: "s&a&\\&&\n",
      expected: {
        matchReference: [],
        backreference: [],
        escapeSequence: ["\\&"],
        caseConversion: [],
      },
    },
    {
      name: "backslash delimiter",
      source: Buffer.from([0x73, 0x5c, 0x61, 0x5c, 0x62, 0x5c, 0x0a]),
      expected: {
        matchReference: [],
        backreference: [],
        escapeSequence: [],
        caseConversion: [],
      },
    },
    {
      name: "carriage-return delimiter",
      source: Buffer.from([0x73, 0x0d, 0x61, 0x0d, 0x5c, 0x0d, 0x0d, 0x0a]),
      expected: {
        matchReference: [],
        backreference: [],
        escapeSequence: ["\\\r"],
        caseConversion: [],
      },
    },
  ];

  for (const { name, source, expected } of cases) {
    await t.test(name, () => assertReplacementTokens(source, expected, name));
  }
});

test("retains a trailing backslash as an incomplete escape sequence", () => {
  const source = "s/a/\\";
  const result = parser.parseSource(source, {
    name: "trailing replacement backslash",
  });

  assert.deepEqual(
    {
      exitCode: result.exitCode,
      hasSyntaxError: result.hasSyntaxError,
      replacement: nodeTexts(result.stdout, result.source, "replacement"),
      escapeSequence: nodeTexts(
        result.stdout,
        result.source,
        "escape_sequence",
      ),
    },
    {
      exitCode: 0,
      hasSyntaxError: true,
      replacement: ["\\"],
      escapeSequence: ["\\"],
    },
    result.output,
  );
});
