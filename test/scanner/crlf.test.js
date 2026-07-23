const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { CRLF, joinLines } = require("../support/source");
const { createParserHarness, nodeCounts } = require("../support/tree-sitter");

const parser = createParserHarness("crlf");
after(() => parser.close());

const cases = [
  {
    name: "parses comments, address ranges, and blocks separated by CRLF",
    lines: ["#n", "1,3p", "{", "  /x/d", "  }", "p", ""],
    expected: {
      first_line_silent: 1,
      block_command: 1,
      delete_command: 1,
      print_command: 2,
      regex_address: 1,
      regex_content: 1,
    },
  },
  {
    name: "keeps an empty backslash text argument at a CRLF boundary",
    lines: ["a\\", "", "p", ""],
    expected: {
      append_command: 1,
      text_block: 1,
      print_command: 1,
    },
  },
  {
    name: "continues a text argument across CRLF lines",
    lines: ["i\\", "first\\", "second", "p", ""],
    expected: {
      insert_command: 1,
      text_block: 1,
      print_command: 1,
    },
  },
  {
    name: "ends a text argument after an even number of backslashes",
    lines: ["c\\", "ends with \\\\", "p", ""],
    expected: {
      change_command: 1,
      text_block: 1,
      print_command: 1,
    },
  },
  {
    name: "continues a substitute replacement across a CRLF line",
    lines: ["s/a/b\\", "c/p", ""],
    expected: {
      substitute_command: 1,
      regex_content: 1,
      replacement: 1,
      print_flag: 1,
    },
  },
  {
    name: "continues regex and translate operands across CRLF lines",
    lines: [
      "/foo\\",
      "bar/p",
      "s/foo\\",
      "bar/replacement/p",
      "y/ab\\",
      "c/AB\\",
      "C/",
      "",
    ],
    expected: {
      regex_address: 1,
      substitute_command: 1,
      translate_command: 1,
      regex_content: 2,
      replacement: 1,
      translate_source: 1,
      translate_destination: 1,
      print_command: 1,
      print_flag: 1,
    },
  },
  {
    name: "parses GNU address forms separated by CRLF",
    lines: ["0~2p", "50~0p", "1,+3p", "/x/,+2p", "/x/,~4p", "/x/IMp", ""],
    expected: {
      print_command: 6,
      periodic_address: 2,
      step_value: 3,
      relative_address: 2,
      next_multiple_address: 1,
      line_offset: 2,
      regex_flags: 1,
      regex_address: 3,
      regex_content: 3,
      ignore_case_flag: 1,
      multiline_flag: 1,
    },
  },
  {
    name: "parses GNU commands and arguments separated by CRLF",
    lines: [
      "Q 7",
      "1,2F",
      "T done;z",
      "R input.txt",
      "W output.txt",
      "v 4.0",
      "e echo hi",
      "",
    ],
    expected: {
      silent_quit_command: 1,
      exit_status: 1,
      file_name_command: 1,
      test_failure_command: 1,
      clear_command: 1,
      read_line_command: 1,
      write_first_line_command: 1,
      version_command: 1,
      version_argument: 1,
      file_argument: 2,
      execute_command: 1,
      shell_command: 1,
    },
  },
  {
    name: "parses GNU inline and backslash text arguments with CRLF",
    lines: ["1,2a inline", "i", "p", "c\\", "text", "p", ""],
    expected: {
      append_command: 1,
      insert_command: 1,
      change_command: 1,
      text_block: 3,
      print_command: 2,
    },
  },
  {
    name: "uses backslash parity for GNU inline text at CRLF boundaries",
    lines: ["a inline\\", "continued", "p", "a inline\\\\", "p", ""],
    expected: {
      append_command: 2,
      text_block: 2,
      print_command: 2,
    },
  },
  {
    name: "continues a GNU shell command across a CRLF line",
    lines: ["e echo one\\", "two", "p", ""],
    expected: {
      execute_command: 1,
      shell_command: 1,
      print_command: 1,
    },
  },
  {
    name: "parses GNU substitute flags with CRLF",
    lines: ["s/a/b/IMe", "s/a/b/g w output;#}", "p", ""],
    expected: {
      substitute_command: 2,
      regex_content: 2,
      replacement: 2,
      print_command: 1,
      ignore_case_flag: 1,
      multiline_flag: 1,
      execute_flag: 1,
      global_flag: 1,
      write_flag: 1,
      file_argument: 1,
    },
  },
  {
    name: "keeps semicolons inside GNU line-consuming data with CRLF",
    lines: ["R input;#}", "e echo;#}", "a inline;#}", "p", ""],
    expected: {
      append_command: 1,
      text_block: 1,
      print_command: 1,
      read_line_command: 1,
      file_argument: 1,
      execute_command: 1,
      shell_command: 1,
    },
  },
];

const trackedNodes = [
  ...new Set(cases.flatMap(({ expected }) => Object.keys(expected))),
];

test("parses valid sed scripts with CRLF line endings", async (t) => {
  for (const { name, lines, expected } of cases) {
    await t.test(name, () => {
      const source = joinLines(CRLF, lines);
      const result = parser.parseSource(source, { name });
      const expectedCounts = Object.fromEntries(
        trackedNodes.map((node) => [node, expected[node] ?? 0]),
      );

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
        nodeCounts(result.stdout, trackedNodes),
        expectedCounts,
        result.output,
      );
    });
  }
});
