const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { createParserHarness, nodeTexts } = require("../support/tree-sitter");

const parser = createParserHarness("regex-boundaries");
after(() => parser.close());

test("finds delimiters around backslashes and closing brackets", async (t) => {
  const cases = [
    {
      name: "keeps paired backslashes inside a bracket expression",
      source: "/[\\\\]/p\n",
      expected: { regex_content: ["[\\\\]"] },
    },
    {
      name: "treats backslash as ordinary before a closing bracket",
      source: "/[\\]]/p\n",
      expected: { regex_content: ["[\\]]"] },
    },
    {
      name: "keeps a hash delimiter after a backslash inside a bracket expression",
      source: "s#[\\#]#x#\n",
      expected: {
        regex_content: ["[\\#]"],
        replacement: ["x"],
      },
    },
    {
      name: "distinguishes a closing bracket from a bracket delimiter",
      source: "\\][\\\\]]p\n",
      expected: { regex_content: ["[\\\\]"] },
    },
    {
      name: "keeps backslash delimiters inside a bracket expression",
      source: "s\\[\\\\]\\x\\\n",
      expected: {
        regex_content: ["[\\\\]"],
        replacement: ["x"],
      },
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
