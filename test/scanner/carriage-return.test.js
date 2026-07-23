const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { CR, VT, applyEdits } = require("../support/source");
const {
  createParserHarness,
  nodeTexts,
} = require("../support/tree-sitter");

const parser = createParserHarness("carriage-return");
const backslash = "\\";
after(() => parser.close());

test("keeps bare carriage returns inside line-consuming data", async (t) => {
  const cases = [
    {
      name: "inside a comment",
      source: `#x${CR}not-a-command\np\n`,
      expected: {
        comment_command: [`#x${CR}not-a-command`],
        print_command: ["p"],
      },
    },
    {
      name: "inside a comment containing diagnostic words",
      source: `# ERROR • MISSING${CR}data\np\n`,
      expected: {
        comment_command: [`# ERROR • MISSING${CR}data`],
        print_command: ["p"],
      },
    },
    {
      name: "inside branch and definition labels",
      source: `bfoo${CR}p\n:foo${CR}p\n`,
      expected: { label: [`foo${CR}p`, `foo${CR}p`] },
    },
    {
      name: "at the start of branch and definition labels",
      source: `b${CR}foo\n:${CR}foo\n`,
      expected: { label: [`${CR}foo`, `${CR}foo`] },
    },
    {
      name: "inside a GNU version argument",
      source: `v4.0${CR}preview\np\n`,
      expected: {
        version_argument: [`4.0${CR}preview`],
        print_command: ["p"],
      },
    },
    {
      name: "inside read command file arguments",
      source: `r file${CR}name\nR ${CR}input\np\n`,
      expected: {
        file_argument: [`file${CR}name`, `${CR}input`],
        print_command: ["p"],
      },
    },
    {
      name: "inside a substitute write-flag file argument",
      source: `s/a/b/w out${CR}name\np\n`,
      expected: {
        file_argument: [`out${CR}name`],
        print_command: ["p"],
      },
    },
    {
      name: "inside a GNU shell command",
      source: `e echo${CR}date\np\n`,
      expected: {
        shell_command: [`echo${CR}date`],
        print_command: ["p"],
      },
    },
    {
      name: "after the legacy shell-command backslash",
      source: `e\\${CR}cmd\np\n`,
      expected: {
        shell_command: [`\\${CR}cmd`],
        print_command: ["p"],
      },
    },
    {
      name: "after a backslash inside a GNU shell command",
      source: `e echo\\${CR}date\np\n`,
      expected: {
        shell_command: [`echo\\${CR}date`],
        print_command: ["p"],
      },
    },
    {
      name: "inside a GNU inline text argument",
      source: `a hello${CR}world\np\n`,
      expected: {
        text_block: [`hello${CR}world`],
        print_command: ["p"],
      },
    },
    {
      name: "after the backslash introducing a text argument",
      source: `a\\${CR}hello\np\n`,
      expected: {
        text_block: [`${CR}hello`],
        print_command: ["p"],
      },
    },
    {
      name: "inside a backslash text argument body",
      source: `a\\\nhello${CR}world\np\n`,
      expected: {
        text_block: [`hello${CR}world`],
        print_command: ["p"],
      },
    },
    {
      name: "after a backslash inside a GNU inline text argument",
      source: `a hello\\${CR}world\np\n`,
      expected: {
        text_block: [`hello\\${CR}world`],
        print_command: ["p"],
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

test("keeps bare carriage returns inside delimited operands", async (t) => {
  const cases = [
    {
      name: "inside regex addresses",
      source: `/a${CR}b/p\n\\|c${CR}d|p\n/[a${CR}b]/p\n`,
      expected: {
        regex_content: [`a${CR}b`, `c${CR}d`, `[a${CR}b]`],
        print_command: ["p", "p", "p"],
      },
    },
    {
      name: "inside substitute patterns and replacements",
      source: `s/${CR}a/${CR}b/\ns/a\\${CR}b/c${CR}d/\n`,
      expected: {
        regex_content: [`${CR}a`, `a\\${CR}b`],
        replacement: [`${CR}b`, `c${CR}d`],
      },
    },
    {
      name: "after a backslash inside a substitute replacement",
      source: `s/a/b\\${CR}c/\n`,
      expected: {
        regex_content: ["a"],
        replacement: [`b\\${CR}c`],
      },
    },
    {
      name: "inside translate source and destination operands",
      source: `y/${CR}a/${CR}b/\ny/a${CR}b/c${CR}d/\n`,
      expected: {
        translate_source: [`${CR}a`, `a${CR}b`],
        translate_destination: [`${CR}b`, `c${CR}d`],
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

test("distinguishes bare carriage returns from CRLF separators", async (t) => {
  const cases = [
    {
      name: "keeps a bare carriage return in a comment at end of file",
      source: `#x${CR}`,
      expected: { comment_command: [`#x${CR}`] },
    },
    {
      name: "keeps a bare carriage return in a label at end of file",
      source: `:x${CR}`,
      expected: { label: [`x${CR}`] },
    },
    {
      name: "keeps a bare carriage return in a file argument at end of file",
      source: `r file${CR}`,
      expected: { file_argument: [`file${CR}`] },
    },
    {
      name: "keeps a bare carriage return in a shell command at end of file",
      source: `e echo${CR}`,
      expected: { shell_command: [`echo${CR}`] },
    },
    {
      name: "keeps a bare carriage return in a text argument at end of file",
      source: `a text${CR}`,
      expected: { text_block: [`text${CR}`] },
    },
    {
      name: "keeps the first of two carriage returns before a CRLF separator",
      source: `#x${CR}\r\np\n`,
      expected: {
        comment_command: [`#x${CR}`],
        print_command: ["p"],
        separator: ["\r\n", "\n"],
      },
    },
    {
      name: "excludes carriage returns that belong to CRLF separators",
      source:
        "#x\r\nbfoo\r\nr file\r\ne echo\r\na text\r\np\n",
      expected: {
        comment_command: ["#x"],
        label: ["foo"],
        file_argument: ["file"],
        shell_command: ["echo"],
        text_block: ["text"],
        print_command: ["p"],
        separator: ["\r\n", "\r\n", "\r\n", "\r\n", "\r\n", "\n"],
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

test("preserves lexical priority around carriage returns", () => {
  const name = "does not reinterpret line-owned tokens as global extras";
  const source =
    `p\n#n${CR}comment\nr #file${CR}name\ne #shell${CR}data\n` +
    `b#comment\nv${VT}4\nb\r\nq\n`;
  const result = parser.parseSource(source, { name });
  const expected = {
    first_line_silent: [],
    comment_command: [`#n${CR}comment`, "#comment"],
    file_argument: [`#file${CR}name`],
    shell_command: [`#shell${CR}data`],
    version_argument: ["\v4"],
    branch_command: ["b", "b"],
    print_command: ["p"],
    quit_command: ["q"],
  };

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

test("accepts carriage return and backslash as regex delimiters", async (t) => {
  const cases = [
    {
      name: "uses carriage return as a substitute delimiter",
      source: `s${CR}a${CR}b${CR}\np\n`,
      expected: {
        substitute_command: [`s${CR}a${CR}b${CR}`],
        regex_content: ["a"],
        replacement: ["b"],
        print_command: ["p"],
        separator: ["\n", "\n"],
      },
    },
    {
      name: "uses carriage return as a translate delimiter",
      source: `y${CR}a${CR}b${CR}\np\n`,
      expected: {
        translate_command: [`y${CR}a${CR}b${CR}`],
        translate_source: ["a"],
        translate_destination: ["b"],
        print_command: ["p"],
      },
    },
    {
      name: "uses carriage return as an address-regex delimiter",
      source: `\\${CR}a${CR}p\n`,
      expected: {
        regex: [`\\${CR}a${CR}`],
        regex_content: ["a"],
        print_command: ["p"],
      },
    },
    {
      name: "keeps escaped carriage-return delimiters inside operands",
      source:
        `s${CR}a\\${CR}b${CR}c${CR}\n` +
        `s${CR}a${CR}b\\${CR}c${CR}\n` +
        `y${CR}a\\${CR}b${CR}c${CR}\n` +
        `y${CR}a${CR}b\\${CR}c${CR}\n` +
        `\\${CR}a\\${CR}b${CR}p\n`,
      expected: {
        regex_content: [`a\\${CR}b`, "a", `a\\${CR}b`],
        replacement: ["c", `b\\${CR}c`],
        translate_source: [`a\\${CR}b`, "a"],
        translate_destination: ["c", `b\\${CR}c`],
        print_command: ["p"],
      },
    },
    {
      name: "uses backslash as a substitute delimiter",
      source: `s${backslash}a${backslash}b${backslash}\np\n`,
      expected: {
        substitute_command: [`s${backslash}a${backslash}b${backslash}`],
        regex_content: ["a"],
        replacement: ["b"],
        print_command: ["p"],
      },
    },
    {
      name: "uses backslash as a translate delimiter",
      source: `y${backslash}a${backslash}b${backslash}\np\n`,
      expected: {
        translate_command: [`y${backslash}a${backslash}b${backslash}`],
        translate_source: ["a"],
        translate_destination: ["b"],
        print_command: ["p"],
      },
    },
    {
      name: "uses backslash as an address-regex delimiter",
      source: `${backslash}${backslash}a${backslash}p\n`,
      expected: {
        regex: [`${backslash}${backslash}a${backslash}`],
        regex_content: ["a"],
        print_command: ["p"],
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

test("rejects bare carriage returns at grammar boundaries and recovers", async (t) => {
  const cases = [
    {
      name: "between two commands",
      source: `p${CR}q\ns/z/Z/\n`,
    },
    {
      name: "between quit and its status",
      source: `q${CR}1\ns/z/Z/\n`,
    },
    {
      name: "between an address and a command",
      source: `1${CR}p\ns/z/Z/\n`,
    },
    {
      name: "between negation and a command",
      source: `!${CR}p\ns/z/Z/\n`,
    },
    {
      name: "between a regex address and a command",
      source: `/a/${CR}p\ns/z/Z/\n`,
    },
    {
      name: "among substitute flags",
      source: `s/a/b/${CR}p\ns/z/Z/\n`,
    },
    {
      name: "at a substitute-pattern CRLF boundary",
      source: `s/a\r\np\ns/z/Z/\n`,
    },
    {
      name: "at a substitute-replacement CRLF boundary",
      source: `s/a/b\r\np\ns/z/Z/\n`,
    },
    {
      name: "at a translate-source CRLF boundary",
      source: `y/a\r\np\ns/z/Z/\n`,
    },
    {
      name: "in an unterminated substitute pattern",
      source: `s/a${CR}b\np\ns/z/Z/\n`,
    },
    {
      name: "when an escaped CR delimiter becomes CRLF in a pattern",
      source: `s${CR}a\\\r\nb${CR}c${CR}\ns/z/Z/\n`,
    },
    {
      name: "when an escaped CR delimiter becomes CRLF in a replacement",
      source: `s${CR}a${CR}b\\\r\nc${CR}\ns/z/Z/\n`,
    },
    {
      name: "when an escaped CR delimiter becomes CRLF in translate source",
      source: `y${CR}a\\\r\nb${CR}c${CR}\ns/z/Z/\n`,
    },
    {
      name: "when an escaped CR delimiter becomes CRLF in translate destination",
      source: `y${CR}a${CR}b\\\r\nc${CR}\ns/z/Z/\n`,
    },
  ];

  for (const { name, source } of cases) {
    await t.test(name, () => {
      const result = parser.parseSource(source, { name });
      const recoveredCommands = nodeTexts(
        result.stdout,
        result.source,
        "substitute_command",
      );

      assert.deepEqual(
        {
          hasSyntaxError: result.hasSyntaxError,
          recoveredAtFinalCommand: recoveredCommands.includes("s/z/Z/"),
        },
        {
          hasSyntaxError: true,
          recoveredAtFinalCommand: true,
        },
        result.output,
      );
    });
  }
});

test("updates carriage-return tokenization after incremental edits", async (t) => {
  const cases = [
    {
      name: "inserts bare carriage-return data into a comment",
      source: "#x\nq\n",
      edits: [{ byteOffset: 2, deletedByteLength: 0, text: `${CR}p` }],
      expected: {
        comment_command: [`#x${CR}p`],
        print_command: [],
        quit_command: ["q"],
      },
    },
    {
      name: "inserts bare carriage-return data into a label",
      source: "bfoo\n:foo\n",
      edits: [{ byteOffset: 4, deletedByteLength: 0, text: `${CR}p` }],
      expected: { label: [`foo${CR}p`, "foo"] },
    },
    {
      name: "inserts a bare carriage return into a substitute pattern",
      source: "s/ab/cd/\n",
      edits: [{ byteOffset: 3, deletedByteLength: 0, text: CR }],
      expected: {
        regex_content: [`a${CR}b`],
        replacement: ["cd"],
      },
    },
    {
      name: "inserts a bare carriage return into a substitute replacement",
      source: "s/ab/cd/\n",
      edits: [{ byteOffset: 6, deletedByteLength: 0, text: CR }],
      expected: {
        regex_content: ["ab"],
        replacement: [`c${CR}d`],
      },
    },
    {
      name: "turns a bare carriage return into CRLF",
      source: `#x${CR}p\nq\n`,
      edits: [{ byteOffset: 3, deletedByteLength: 0, text: "\n" }],
      expected: {
        comment_command: ["#x"],
        print_command: ["p"],
        quit_command: ["q"],
      },
    },
    {
      name: "turns CRLF into a bare carriage return",
      source: "#x\r\np\nq\n",
      edits: [{ byteOffset: 3, deletedByteLength: 1, text: "" }],
      expected: {
        comment_command: [`#x${CR}p`],
        print_command: [],
        quit_command: ["q"],
      },
    },
    {
      name: "replaces all substitute slashes with carriage-return delimiters",
      source: "s/a/b/\np\n",
      edits: [
        { byteOffset: 1, deletedByteLength: 1, text: CR },
        { byteOffset: 3, deletedByteLength: 1, text: CR },
        { byteOffset: 5, deletedByteLength: 1, text: CR },
      ],
      expected: {
        substitute_command: [`s${CR}a${CR}b${CR}`],
        print_command: ["p"],
      },
    },
    {
      name: "turns an escaped bare carriage return into escaped CRLF",
      source: `s/a\\${CR}b/c/\n`,
      edits: [{ byteOffset: 5, deletedByteLength: 0, text: "\n" }],
      expected: {
        regex_content: ["a\\\r\nb"],
        replacement: ["c"],
      },
    },
    {
      name: "turns escaped CRLF into an escaped bare carriage return",
      source: "s/a\\\r\nb/c/\n",
      edits: [{ byteOffset: 5, deletedByteLength: 1, text: "" }],
      expected: {
        regex_content: [`a\\${CR}b`],
        replacement: ["c"],
      },
    },
  ];

  for (const { name, source, edits, expected } of cases) {
    await t.test(name, () => {
      const result = parser.parseSource(source, { edits, name });
      const editedSource = applyEdits(source, edits);

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
        assert.deepEqual(nodeTexts(result.stdout, editedSource, node), texts);
      }
    });
  }
});
