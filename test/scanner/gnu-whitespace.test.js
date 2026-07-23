const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { CR, FF, TAB, VT } = require("../support/source");
const { createParserHarness, nodeCounts } = require("../support/tree-sitter");

const parser = createParserHarness("gnu-whitespace");
after(() => parser.close());

test("accepts GNU control whitespace at command-loop boundaries", async (t) => {
  const cases = [
    {
      name: "before commands at the start of a line",
      source: ` ${TAB}${FF} ${TAB}p\n${TAB}${VT} Q\n ${CR} z\n`,
      expected: {
        print_command: 1,
        silent_quit_command: 1,
        clear_command: 1,
      },
    },
    {
      name: "between a semicolon and the next command",
      source: `p; ${FF} ${TAB}Q\np;${TAB}${VT} T done\np; ${CR} z\n`,
      expected: {
        print_command: 3,
        silent_quit_command: 1,
        test_failure_command: 1,
        clear_command: 1,
      },
    },
    {
      name: "between a block brace and its commands",
      source: `{ ${FF}p; ${VT} Q}\n`,
      expected: {
        block_command: 1,
        print_command: 1,
        silent_quit_command: 1,
      },
    },
    {
      name: "before commands after a CRLF boundary",
      source: `p\r\n${FF}q\r\n`,
      expected: { print_command: 1, quit_command: 1 },
    },
    {
      name: "inside label arguments",
      source: `:${FF}label\nb${FF}label\nT${VT}other\n`,
      expected: {
        label_command: 1,
        branch_command: 1,
        test_failure_command: 1,
        label: 3,
      },
    },
    {
      name: "before line-consuming commands and comments",
      source: `${FF}R input\n${VT}# comment\n`,
      expected: {
        read_line_command: 1,
        file_argument: 1,
        comment_command: 1,
      },
    },
    {
      name: "as the entire script",
      source: FF,
      expected: {},
    },
    {
      name: "on otherwise empty lines",
      source: `${FF}\np\n${VT}\nq\n${CR}`,
      expected: { print_command: 1, quit_command: 1 },
    },
    {
      name: "after a semicolon without another command",
      source: `p;${FF}\nq;${VT}`,
      expected: { print_command: 1, quit_command: 1 },
    },
    {
      name: "between repeated empty semicolon slots",
      source: `${FF};${VT};${CR} p\np;${FF};${VT};${CR} q\n`,
      expected: { print_command: 2, quit_command: 1 },
    },
    {
      name: "inside otherwise empty and nonempty blocks",
      source: `{${FF}}\n{p;${FF}}\n{;${VT}}\n{${CR}\n}\n`,
      expected: { block_command: 4, print_command: 1 },
    },
    {
      name: "immediately before a CRLF line ending",
      source: `${FF}\r\nq\n`,
      expected: { quit_command: 1 },
    },
    {
      name: "after the first-line silent marker before a bare carriage return",
      source: `#n${CR}p`,
      expected: { first_line_silent: 1, print_command: 0 },
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
      assert.deepEqual(
        nodeCounts(result.stdout, Object.keys(expected)),
        expected,
        result.output,
      );
    });
  }
});

test("rejects GNU control whitespace outside command-loop boundaries", async (t) => {
  const cases = [
    {
      name: "between an address and its command",
      source: `1${FF}p\n`,
    },
    {
      name: "between negation and its command",
      source: `!${FF}p\n`,
    },
    {
      name: "after a command at end of file",
      source: `p${FF}`,
    },
    {
      name: "between a command and its line ending",
      source: `p${FF}\nq\n`,
    },
    {
      name: "between a command and a semicolon",
      source: `p${FF};\n`,
    },
    {
      name: "between a command and a closing brace",
      source: `{p${FF}}\n`,
    },
    {
      name: "between a command and a trailing comment",
      source: `p${FF}# comment\n`,
    },
    {
      name: "between quit and its exit status",
      source: `q${FF}1\n`,
    },
    {
      name: "after the comma in an address range",
      source: `1,${FF}2p\n`,
    },
    {
      name: "as a bare-CR escaped-regex fallthrough",
      source: `\\${CR}p\n`,
    },
  ];

  for (const { name, source } of cases) {
    await t.test(name, () => {
      const result = parser.parseSource(source, { name });

      assert.deepEqual(
        { hasSyntaxError: result.hasSyntaxError },
        { hasSyntaxError: true },
        result.output,
      );
    });
  }
});

test("recognizes GNU control whitespace after incremental edits", async (t) => {
  const cases = [
    {
      name: "inserts form feed before a command",
      source: "p\n",
      edits: [{ byteOffset: 0, deletedByteLength: 0, text: FF }],
      expected: { print_command: 1 },
    },
    {
      name: "inserts form feed after a semicolon",
      source: "p;\nq\n",
      edits: [{ byteOffset: 2, deletedByteLength: 0, text: FF }],
      expected: { print_command: 1, quit_command: 1 },
    },
    {
      name: "inserts vertical tab before a block closes",
      source: "{p;}\n",
      edits: [{ byteOffset: 3, deletedByteLength: 0, text: VT }],
      expected: { block_command: 1, print_command: 1 },
    },
  ];

  for (const { name, source, edits, expected } of cases) {
    await t.test(name, () => {
      const result = parser.parseSource(source, { edits, name });

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
        nodeCounts(result.stdout, Object.keys(expected)),
        expected,
        result.output,
      );
    });
  }
});
