/**
 * GNU sed syntax additions and POSIX command-capability extensions.
 *
 * Rules not listed here retain their POSIX descriptors. Capabilities are
 * unioned, so a later Darwin/BSD profile can add behavior without removing
 * syntax already recognized by the public superset parser.
 */
module.exports = {
  name: "gnu",
  syntax: {
    extendedCommandLoopWhitespace: true,
    addressRules: ["periodic_address"],
    rangeEndRules: ["relative_address", "next_multiple_address"],
    regexAddressFlags: [
      { rule: "_address_ignore_case_flag", alias: "ignore_case_flag" },
      { rule: "_address_multiline_flag", alias: "multiline_flag" },
    ],
    substituteFlagRules: ["multiline_flag", "execute_flag"],
    ignoreCaseFlags: ["I"],
    textArgumentRules: ["_inline_text_argument"],
    quitStatus: true,
    listWidth: true,
  },
  rules: {
    periodic_address: ($) =>
      seq(
        field("start", $.line_number_address),
        optional($._blanks),
        "~",
        optional($._blanks),
        field("step", $.step_value),
      ),

    step_value: () => /\d+/,

    relative_address: ($) =>
      seq(
        "+",
        optional($._blanks),
        field("offset", $.line_offset),
      ),

    line_offset: () => /\d+/,

    next_multiple_address: ($) =>
      seq(
        "~",
        optional($._blanks),
        field("multiple", $.step_value),
      ),

    _address_ignore_case_flag: () => "I",

    _address_multiline_flag: () => "M",

    silent_quit_command: ($) =>
      seq(
        "Q",
        optional(seq(
          optional($._blanks),
          field("status", $.exit_status),
        )),
      ),

    exit_status: () => /\d+/,

    line_wrap_length: () => /\d+/,

    file_name_command: () => "F",

    clear_command: () => "z",

    read_line_command: ($) =>
      seq("R", optional($._blanks), field("file", $.file_argument)),

    write_first_line_command: ($) =>
      seq("W", optional($._blanks), field("file", $.file_argument)),

    test_failure_command: ($) =>
      seq(
        "T",
        optional(seq(optional($._blanks), field("label", $.label))),
      ),

    version_command: ($) =>
      seq(
        "v",
        optional(seq(
          optional($._blanks),
          field("version", $.version_argument),
        )),
      ),

    version_argument: ($) => $._line_word,

    multiline_flag: () => choice("m", "M"),

    execute_flag: () => "e",

    execute_command: ($) =>
      seq(
        "e",
        optional(seq(
          optional($._blanks),
          field("command", $.shell_command),
        )),
      ),

    _inline_text_argument: ($) =>
      seq(optional($._blanks), field("text", $.text_block)),
  },
  commands: [
    { rule: "label_command", maxAddresses: 0, termination: "chainable" },

    { rule: "silent_quit_command", maxAddresses: 1, termination: "chainable" },

    { rule: "line_number_command", maxAddresses: 2, termination: "chainable" },
    { rule: "branch_command", maxAddresses: 2, termination: "chainable" },
    { rule: "test_command", maxAddresses: 2, termination: "chainable" },
    { rule: "file_name_command", maxAddresses: 2, termination: "chainable" },
    { rule: "test_failure_command", maxAddresses: 2, termination: "chainable" },
    { rule: "version_command", maxAddresses: 2, termination: "chainable" },
    { rule: "clear_command", maxAddresses: 2, termination: "chainable" },

    { rule: "append_command", maxAddresses: 2, termination: "line" },
    { rule: "insert_command", maxAddresses: 2, termination: "line" },
    { rule: "read_command", maxAddresses: 2, termination: "line" },
    { rule: "execute_command", maxAddresses: 2, termination: "line" },
    { rule: "read_line_command", maxAddresses: 2, termination: "line" },
    { rule: "write_first_line_command", maxAddresses: 2, termination: "line" },
  ],
};
