/**
 * POSIX.1-2024 sed syntax and command capabilities.
 *
 * These descriptors are kept separate from grammar.js so implementation
 * dialects can extend syntax, command arity, and termination rules without
 * duplicating the syntax tree definitions.
 */
module.exports = {
  name: "posix",
  syntax: {
    extendedCommandLoopWhitespace: false,
    addressRules: [
      "line_number_address",
      "last_line_address",
      "regex_address",
      "escaped_regex_address",
    ],
    rangeEndRules: ["address"],
    regexAddressFlags: [],
    substituteFlagRules: [
      "occurrence_flag",
      "global_flag",
      "ignore_case_flag",
      "print_flag",
    ],
    ignoreCaseFlags: ["i"],
    textArgumentRules: ["_backslash_text_argument"],
    quitStatus: false,
    listWidth: false,
  },
  rules: {
    _backslash_text_argument: ($) =>
      seq(
        optional($._blanks),
        $._text_command_start,
        field("text", $.text_block),
      ),
  },
  commands: [
    { rule: "label_command", maxAddresses: 0, termination: "line" },

    { rule: "quit_command", maxAddresses: 1, termination: "chainable" },
    { rule: "line_number_command", maxAddresses: 1, termination: "chainable" },

    { rule: "append_command", maxAddresses: 1, termination: "line" },
    { rule: "insert_command", maxAddresses: 1, termination: "line" },
    { rule: "read_command", maxAddresses: 1, termination: "line" },

    { rule: "delete_command", maxAddresses: 2, termination: "chainable" },
    { rule: "print_command", maxAddresses: 2, termination: "chainable" },
    { rule: "next_command", maxAddresses: 2, termination: "chainable" },
    {
      rule: "delete_first_line_command",
      maxAddresses: 2,
      termination: "chainable",
    },
    { rule: "get_command", maxAddresses: 2, termination: "chainable" },
    { rule: "get_append_command", maxAddresses: 2, termination: "chainable" },
    { rule: "hold_command", maxAddresses: 2, termination: "chainable" },
    { rule: "hold_append_command", maxAddresses: 2, termination: "chainable" },
    { rule: "next_append_command", maxAddresses: 2, termination: "chainable" },
    {
      rule: "print_first_line_command",
      maxAddresses: 2,
      termination: "chainable",
    },
    { rule: "exchange_command", maxAddresses: 2, termination: "chainable" },
    { rule: "list_command", maxAddresses: 2, termination: "chainable" },
    { rule: "block_command", maxAddresses: 2, termination: "chainable" },
    {
      rule: "_substitute_command_without_write",
      alias: "substitute_command",
      maxAddresses: 2,
      termination: "chainable",
    },
    { rule: "translate_command", maxAddresses: 2, termination: "chainable" },

    { rule: "write_command", maxAddresses: 2, termination: "line" },
    {
      rule: "_substitute_command_with_write",
      alias: "substitute_command",
      maxAddresses: 2,
      termination: "line",
    },
    { rule: "branch_command", maxAddresses: 2, termination: "line" },
    { rule: "test_command", maxAddresses: 2, termination: "line" },
    { rule: "change_command", maxAddresses: 2, termination: "line" },
  ],
};
