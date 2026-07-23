const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { createParserHarness, nodeTexts } = require("../support/tree-sitter");

const parser = createParserHarness("end-of-file");
after(() => parser.close());

test("accepts valid scripts without a final newline", async (t) => {
  const cases = [
    {
      name: "accepts trailing blanks without a command",
      source: " \t  ",
      expected: { command: [] },
    },
    {
      name: "accepts a command followed by spaces",
      source: "p   ",
      expected: { print_command: ["p"] },
    },
    {
      name: "accepts a label followed by tabs and spaces",
      source: ":done\t  ",
      expected: {
        label_command: [":done"],
        label: ["done"],
      },
    },
    {
      name: "accepts substitute flags followed by spaces",
      source: "s/a/b/p   ",
      expected: {
        substitute_command: ["s/a/b/p"],
        print_flag: ["p"],
      },
    },
    {
      name: "accepts a block followed by tabs and spaces",
      source: "{p}\t ",
      expected: {
        block_command: ["{p}"],
        print_command: ["p"],
      },
    },
    {
      name: "accepts a GNU version argument followed by spaces",
      source: "v 4.0   ",
      expected: {
        version_command: ["v 4.0"],
        version_argument: ["4.0"],
      },
    },
    {
      name: "accepts an empty GNU execute command followed by spaces",
      source: "e   ",
      expected: { execute_command: ["e"] },
    },
  ];

  for (const { name, source, expected } of cases) {
    await t.test(name, () => {
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

      for (const [node, texts] of Object.entries(expected)) {
        assert.deepEqual(nodeTexts(result.stdout, result.source, node), texts);
      }
    });
  }
});

test("reports incomplete delimited operands at end of file", async (t) => {
  const cases = [
    {
      name: "empty regex address",
      source: "/",
      expected: { regex_content: [""] },
    },
    {
      name: "empty substitute pattern",
      source: "s/",
      expected: { regex_content: [""] },
    },
    {
      name: "empty substitute replacement",
      source: "s/a/",
      expected: {
        regex_content: ["a"],
        replacement: [""],
      },
    },
    {
      name: "empty translate source",
      source: "y/",
      expected: { translate_source: [""] },
    },
    {
      name: "empty translate destination",
      source: "y/a/",
      expected: {
        translate_source: ["a"],
        translate_destination: [""],
      },
    },
    {
      name: "unterminated translate destination",
      source: "y/a/b",
      expected: {
        translate_source: ["a"],
        translate_destination: ["b"],
      },
    },
  ];

  for (const { name, source, expected } of cases) {
    await t.test(name, () => {
      const result = parser.parseSource(source, { name });

      assert.equal(result.hasSyntaxError, true, result.output);
      for (const [node, texts] of Object.entries(expected)) {
        assert.deepEqual(nodeTexts(result.stdout, result.source, node), texts);
      }
    });
  }
});
