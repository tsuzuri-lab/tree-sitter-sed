const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { createParserHarness } = require("../support/tree-sitter");

const parser = createParserHarness("gnu-addresses");
after(() => parser.close());

test("accepts zero only in the GNU address forms that define it", async (t) => {
  const validForms = [
    ["zero-to-regex range", "0,/start/p\n"],
    ["zero-to-alternate-regex range", "0,\\#start#p\n"],
    ["zero read address", "0r prelude.txt\n"],
    ["zero read address with leading zeros", "00r prelude.txt\n"],
    ["zero periodic start with a positive step", "0~3p\n"],
    ["zero periodic start with a leading-zero step", "0~03p\n"],
    ["zero as a second range address", "1,0p\n"],
    ["leading zeros as a second range address", "1,00p\n"],
  ];

  for (const [name, source] of validForms) {
    await t.test(name, () => {
      const result = parser.parseSource(source, { name });

      assert.equal(result.hasSyntaxError, false, result.output);
    });
  }
});

test("rejects zero outside its GNU address forms", async (t) => {
  const invalidForms = [
    ["ordinary zero address", "0p\n"],
    ["zero-to-line range", "0,1p\n"],
    ["zero-to-zero range", "0,0p\n"],
    ["zero-to-last-line range", "0,$p\n"],
    ["zero-to-relative range", "0,+2p\n"],
    ["zero-to-next-multiple range", "0,~2p\n"],
    ["negated zero read address", "0!r prelude.txt\n"],
    ["zero address on GNU read-line", "0R prelude.txt\n"],
    ["zero periodic start with a zero step", "0~0p\n"],
  ];

  for (const [name, source] of invalidForms) {
    await t.test(name, () => {
      const result = parser.parseSource(source, { name });

      assert.equal(result.hasSyntaxError, true, result.output);
    });
  }
});
