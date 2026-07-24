/**
 * @file Tree-sitter grammar for sed scripts, covering POSIX.1-2024 syntax and GNU sed extensions.
 * @author tsuzuri-lab
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const {
  commandGroups,
  dialectRules,
  syntaxCapabilities,
} = require("./grammar/dialects");

function syntaxRuleChoice($, descriptors) {
  const rules = descriptors.map((descriptor) => {
    const normalized =
      typeof descriptor === "string" ? { rule: descriptor } : descriptor;
    const symbol = $[normalized.rule];
    return normalized.alias ? alias(symbol, $[normalized.alias]) : symbol;
  });

  return rules.length === 1 ? rules[0] : choice(...rules);
}

function commandBodyChoice($, descriptors) {
  return choice(
    ...descriptors.map((descriptor) => {
      const symbol = $[descriptor.rule];
      return descriptor.alias ? alias(symbol, $[descriptor.alias]) : symbol;
    }),
  );
}

function optionalCommandLoopWhitespace($) {
  return syntaxCapabilities.extendedCommandLoopWhitespace
    ? seq(optional($._blanks), optional($._gnu_outer_loop_whitespace))
    : optional($._blanks);
}

function gnuOuterLoopPadding($) {
  return seq(optional($._blanks), $._gnu_outer_loop_whitespace);
}

function lineContent($, separator, commandSequence) {
  const forms = [commandSequence, seq(separator, optional(commandSequence))];

  if (syntaxCapabilities.extendedCommandLoopWhitespace) {
    forms.push(
      gnuOuterLoopPadding($),
      seq(gnuOuterLoopPadding($), separator, optional(commandSequence)),
    );
  }

  return prec.right(choice(...forms));
}

function semicolonSeparator($, run) {
  const separator = () => alias(run, $.separator);

  if (!syntaxCapabilities.extendedCommandLoopWhitespace) {
    return separator();
  }

  return prec.right(
    seq(
      separator(),
      repeat(seq($._gnu_outer_loop_whitespace, separator())),
      optional($._gnu_outer_loop_whitespace),
    ),
  );
}

const commandForms = {
  chainable: [
    ["zeroAddressChainable", 0],
    ["oneAddressChainable", 1],
    ["twoAddressChainable", 2],
  ],
  line: [
    ["zeroAddressLineTerminated", 0],
    ["oneAddressLineTerminated", 1],
    ["twoAddressLineTerminated", 2],
  ],
};

function addressedCommand($, descriptors, maxAddresses) {
  const parts = [];

  if (maxAddresses > 0) {
    parts.push(
      optional(
        seq(
          field(
            "addresses",
            maxAddresses === 1 ? $.address : choice($.address_range, $.address),
          ),
          optional($._blanks),
        ),
      ),
    );
  }

  parts.push(
    optional(seq(field("negation", $.negation), optional($._blanks))),
    field("body", commandBodyChoice($, descriptors)),
  );

  const standardForm = seq(...parts);
  const zeroAddressDescriptors = descriptors.filter(
    ({ allowsZeroAddress }) => allowsZeroAddress,
  );

  if (zeroAddressDescriptors.length === 0) {
    return standardForm;
  }

  return choice(
    standardForm,
    seq(
      field("addresses", alias($._zero_address, $.address)),
      optional($._blanks),
      field("body", commandBodyChoice($, zeroAddressDescriptors)),
    ),
  );
}

function commandsForTermination($, termination) {
  const forms = commandForms[termination]
    .filter(([group]) => commandGroups[group].length > 0)
    .map(([group, maxAddresses]) =>
      addressedCommand($, commandGroups[group], maxAddresses),
    );

  return forms.length === 1 ? forms[0] : choice(...forms);
}

module.exports = grammar({
  name: "sed",

  externals: ($) => [
    $._regex_address_start,
    $._escaped_regex_address_start,
    $._regex_address_end,
    $._substitute_start,
    $._substitute_middle,
    $._substitute_end,
    $._translate_start,
    $._translate_middle,
    $._translate_end,
    $._regex_content,
    $._replacement_literal,
    $._replacement_backreference,
    $._replacement_escape_sequence,
    $._replacement_case_conversion,
    $._translate_text,
    $._text_command_start,
    $._text_block,
    $.shell_command,
    $.first_line_silent,
    $.comment_command,
    $.file_argument,
    $._line_word,
    $._gnu_outer_loop_whitespace,
    $._right_brace,
  ],

  extras: () => [],

  conflicts: ($) => [
    [$.command_list],
    [$._command_sequence],
    [$._block_command_sequence],
    [$.address, $.periodic_address],
    [$.periodic_address, $._zero_address],
    [$.regex_address],
    [$.escaped_regex_address],
    [$.regex_flags],
    [$.quit_command],
    [$.silent_quit_command],
    [$.list_command],
    [$.branch_command],
    [$.test_command],
    [$.test_failure_command],
    [$.version_command],
    [$.execute_command],
    [$._substitute_command_without_write, $._substitute_command_with_write],
    [$._substitute_flags_without_write],
    [$._substitute_flags_without_write, $._substitute_flags_with_write],
  ],

  rules: {
    script: ($) =>
      seq(
        optional($.first_line_silent),
        optional($.command_list),
        optional($._blanks),
      ),

    command_list: ($) =>
      choice(
        $._line_content,
        seq(
          optional($._line_content),
          $._line_end,
          repeat(seq(optional($._line_content), $._line_end)),
          optional($._line_content),
        ),
      ),

    _line_content: ($) =>
      lineContent($, $._semicolon_separator, $._command_sequence),

    _command_sequence: ($) =>
      seq(
        repeat(seq($._chainable_command_item, $._semicolon_separator)),
        choice(
          seq($._chainable_command_item, $._trailing_comment_item),
          seq($._chainable_command_item, optional($._semicolon_separator)),
          $._line_terminated_command_item,
          $._comment_item,
        ),
      ),

    _block_command_sequence: ($) =>
      seq(
        repeat(seq($._chainable_command_item, $._block_semicolon_separator)),
        choice(
          seq($._chainable_command_item, $._trailing_comment_item),
          seq(
            $._chainable_command_item,
            optional($._block_semicolon_separator),
          ),
          $._line_terminated_command_item,
          $._comment_item,
        ),
      ),

    _chainable_command_item: ($) =>
      seq(
        optionalCommandLoopWhitespace($),
        alias($._chainable_command, $.command),
      ),

    _line_terminated_command_item: ($) =>
      seq(
        optionalCommandLoopWhitespace($),
        alias($._line_terminated_command, $.command),
      ),

    _comment_item: ($) =>
      seq(
        optionalCommandLoopWhitespace($),
        optional(seq(field("negation", $.negation), optional($._blanks))),
        $.comment_command,
      ),

    _trailing_comment_item: ($) => seq(optional($._blanks), $.comment_command),

    _line_end: ($) => seq(optional($._blanks), $._line_separator),

    _line_separator: ($) => alias($._newline, $.separator),

    _semicolon_separator: ($) => semicolonSeparator($, $._semicolon_run),

    _block_semicolon_separator: ($) =>
      semicolonSeparator($, $._block_semicolon_run),

    _blanks: () => token(/[ \t]+/),

    _newline: () => token(/\r?\n/),

    _semicolon_run: () => token(/[ \t]*(;[ \t]*)+/),

    _block_semicolon_run: () => token(/[ \t]*(;[ \t]*)+/),

    command: ($) => choice($._chainable_command, $._line_terminated_command),

    _chainable_command: ($) => commandsForTermination($, "chainable"),

    _line_terminated_command: ($) => commandsForTermination($, "line"),

    address_range: ($) => {
      const forms = [
        seq(
          field("start", $.address),
          optional($._blanks),
          ",",
          optional($._blanks),
          field("end", syntaxRuleChoice($, syntaxCapabilities.rangeEndRules)),
        ),
      ];

      if (syntaxCapabilities.zeroRegexRangeStart) {
        forms.push(
          seq(
            field("start", alias($._zero_address, $.address)),
            optional($._blanks),
            ",",
            optional($._blanks),
            field("end", alias($._zero_regex_range_end, $.address)),
          ),
        );
      }

      return choice(...forms);
    },

    address: ($) => syntaxRuleChoice($, syntaxCapabilities.addressRules),

    line_number_address: () => /0*[1-9]\d*/,

    last_line_address: () => "$",

    regex_address: ($) =>
      seq(
        field("pattern", alias($._slash_delimited_regex, $.regex)),
        optional(field("flags", $.regex_flags)),
      ),

    _slash_delimited_regex: ($) =>
      seq(
        $._regex_address_start,
        optional(field("body", $.regex_content)),
        $._regex_address_end,
      ),

    escaped_regex_address: ($) =>
      seq(
        field("pattern", alias($._escaped_delimited_regex, $.regex)),
        optional(field("flags", $.regex_flags)),
      ),

    _escaped_delimited_regex: ($) =>
      seq(
        $._escaped_regex_address_start,
        optional(field("body", $.regex_content)),
        $._regex_address_end,
      ),

    regex_flags: ($) =>
      seq(
        optional($._blanks),
        syntaxRuleChoice($, syntaxCapabilities.regexAddressFlags),
        repeat(
          seq(
            optional($._blanks),
            syntaxRuleChoice($, syntaxCapabilities.regexAddressFlags),
          ),
        ),
      ),

    negation: () => "!",

    delete_command: () => "d",

    print_command: () => "p",

    quit_command: ($) =>
      syntaxCapabilities.quitStatus
        ? seq(
            "q",
            optional(seq(optional($._blanks), field("status", $.exit_status))),
          )
        : "q",

    next_command: () => "n",

    delete_first_line_command: () => "D",

    get_command: () => "g",

    get_append_command: () => "G",

    hold_command: () => "h",

    hold_append_command: () => "H",

    next_append_command: () => "N",

    print_first_line_command: () => "P",

    exchange_command: () => "x",

    line_number_command: () => "=",

    list_command: ($) =>
      syntaxCapabilities.listWidth
        ? seq(
            "l",
            optional(
              seq(optional($._blanks), field("width", $.line_wrap_length)),
            ),
          )
        : "l",

    read_command: ($) =>
      seq("r", optional($._blanks), field("file", $.file_argument)),

    write_command: ($) =>
      seq("w", optional($._blanks), field("file", $.file_argument)),

    block_command: ($) =>
      seq(
        "{",
        optional(alias($._block_command_list, $.command_list)),
        alias($._right_brace, "}"),
      ),

    _block_command_list: ($) =>
      choice(
        $._block_line_content,
        seq(
          optional($._block_line_content),
          $._line_end,
          repeat(seq(optional($._block_line_content), $._line_end)),
          optional($._block_line_content),
        ),
      ),

    _block_line_content: ($) =>
      lineContent($, $._block_semicolon_separator, $._block_command_sequence),

    substitute_command: ($) =>
      choice(
        $._substitute_command_without_write,
        $._substitute_command_with_write,
      ),

    _substitute_command_without_write: ($) =>
      seq(
        "s",
        field("pattern", alias($._substitute_pattern, $.regex)),
        optional(field("replacement", $.replacement)),
        $._substitute_end,
        optional(
          field(
            "flags",
            alias($._substitute_flags_without_write, $.substitute_flags),
          ),
        ),
      ),

    _substitute_command_with_write: ($) =>
      prec.right(
        seq(
          "s",
          field("pattern", alias($._substitute_pattern, $.regex)),
          optional(field("replacement", $.replacement)),
          $._substitute_end,
          field(
            "flags",
            alias($._substitute_flags_with_write, $.substitute_flags),
          ),
        ),
      ),

    translate_command: ($) =>
      seq(
        "y",
        $._translate_start,
        optional(field("source", $.translate_source)),
        $._translate_middle,
        optional(field("destination", $.translate_destination)),
        $._translate_end,
      ),

    _substitute_pattern: ($) =>
      seq(
        $._substitute_start,
        optional(field("body", $.regex_content)),
        $._substitute_middle,
      ),

    regex_content: ($) => $._regex_content,

    replacement: ($) =>
      repeat1(
        choice(
          $._replacement_literal,
          alias("&", $.match_reference),
          alias($._replacement_backreference, $.backreference),
          alias($._replacement_escape_sequence, $.escape_sequence),
          alias($._replacement_case_conversion, $.case_conversion),
        ),
      ),

    translate_source: ($) => $._translate_text,

    translate_destination: ($) => $._translate_text,

    substitute_flags: ($) =>
      choice($._substitute_flags_without_write, $._substitute_flags_with_write),

    _substitute_flags_without_write: ($) =>
      seq(
        optional($._blanks),
        $._substitute_flag,
        repeat(seq(optional($._blanks), $._substitute_flag)),
      ),

    _substitute_flags_with_write: ($) =>
      seq(
        optional($._blanks),
        repeat(seq($._substitute_flag, optional($._blanks))),
        $.write_flag,
      ),

    _substitute_flag: ($) =>
      syntaxRuleChoice($, syntaxCapabilities.substituteFlagRules),

    occurrence_flag: () => /\d+/,

    global_flag: () => "g",

    ignore_case_flag: () => choice(...syntaxCapabilities.ignoreCaseFlags),

    print_flag: () => "p",

    write_flag: ($) =>
      seq("w", optional($._blanks), field("file", $.file_argument)),

    label_command: ($) =>
      seq(":", optional($._blanks), field("label", $.label)),

    branch_command: ($) =>
      seq("b", optional(seq(optional($._blanks), field("label", $.label)))),

    test_command: ($) =>
      seq("t", optional(seq(optional($._blanks), field("label", $.label)))),

    label: ($) => $._line_word,

    append_command: ($) => seq("a", $._text_argument),

    insert_command: ($) => seq("i", $._text_argument),

    change_command: ($) => seq("c", $._text_argument),

    _text_argument: ($) =>
      syntaxRuleChoice($, syntaxCapabilities.textArgumentRules),

    text_block: ($) => $._text_block,

    ...dialectRules,
  },
});
