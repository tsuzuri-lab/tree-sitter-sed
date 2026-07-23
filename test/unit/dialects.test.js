const assert = require("node:assert/strict");
const test = require("node:test");
const {
  commandGroups,
  dialectRules,
  groupCommands,
  mergeProfiles,
  mergeRules,
  mergeSyntax,
  profiles,
  syntaxCapabilities,
} = require("../../grammar/dialects");

function ruleNames(descriptors) {
  return descriptors.map(({ rule }) => rule);
}

test("groups POSIX commands by address count and line termination", () => {
  const groups = groupCommands(mergeProfiles(profiles.posix));

  assert.deepEqual(ruleNames(groups.zeroAddressLineTerminated), [
    "label_command",
  ]);
  assert.deepEqual(ruleNames(groups.oneAddressLineTerminated), [
    "append_command",
    "insert_command",
    "read_command",
  ]);
  assert.deepEqual(
    ruleNames(groups.twoAddressChainable).includes("list_command"),
    true,
  );
});

test("groups merged POSIX and GNU commands by their broadest capability", () => {
  assert.deepEqual(commandGroups.zeroAddressLineTerminated, []);
  assert.deepEqual(commandGroups.oneAddressLineTerminated, []);
  assert.deepEqual(
    ruleNames(commandGroups.zeroAddressChainable).includes("label_command"),
    true,
  );
  assert.deepEqual(
    ruleNames(commandGroups.twoAddressChainable).includes("list_command"),
    true,
  );
  assert.deepEqual(
    ruleNames(commandGroups.twoAddressLineTerminated).includes("read_command"),
    true,
  );
});

test("merging dialect profiles is independent of profile order", () => {
  function comparableProfile(...dialects) {
    return mergeProfiles(...dialects)
      .map(({ alias, maxAddresses, rule, termination }) => ({
        alias,
        maxAddresses,
        rule,
        termination,
      }))
      .sort((left, right) => left.rule.localeCompare(right.rule));
  }

  assert.deepEqual(
    comparableProfile(profiles.gnu, profiles.posix),
    comparableProfile(profiles.posix, profiles.gnu),
  );
});

test("a narrower profile cannot remove broader command capabilities", () => {
  const narrowedProfile = {
    commands: [
      { rule: "line_number_command", maxAddresses: 1, termination: "line" },
    ],
  };
  const lineNumber = mergeProfiles(
    profiles.posix,
    profiles.gnu,
    narrowedProfile,
  ).find(({ rule }) => rule === "line_number_command");

  assert.deepEqual(
    {
      maxAddresses: lineNumber.maxAddresses,
      termination: lineNumber.termination,
    },
    {
      maxAddresses: 2,
      termination: "chainable",
    },
  );
});

test("the POSIX profile exposes only POSIX syntax capabilities", () => {
  const syntax = mergeSyntax(profiles.posix);

  assert.deepEqual(
    {
      addressRulesIncludeLineNumber: syntax.addressRules.includes(
        "line_number_address",
      ),
      addressRulesIncludePeriodic:
        syntax.addressRules.includes("periodic_address"),
      extendedCommandLoopWhitespace: syntax.extendedCommandLoopWhitespace,
      ignoreCaseFlags: syntax.ignoreCaseFlags,
      listWidth: syntax.listWidth,
      quitStatus: syntax.quitStatus,
    },
    {
      addressRulesIncludeLineNumber: true,
      addressRulesIncludePeriodic: false,
      extendedCommandLoopWhitespace: false,
      ignoreCaseFlags: ["i"],
      listWidth: false,
      quitStatus: false,
    },
  );
});

test("the merged profiles expose POSIX and GNU syntax capabilities", () => {
  assert.deepEqual(
    {
      addressRulesIncludePeriodic:
        syntaxCapabilities.addressRules.includes("periodic_address"),
      extendedCommandLoopWhitespace:
        syntaxCapabilities.extendedCommandLoopWhitespace,
      ignoreCaseFlags: syntaxCapabilities.ignoreCaseFlags,
      listWidth: syntaxCapabilities.listWidth,
      quitStatus: syntaxCapabilities.quitStatus,
      rangeEndRulesIncludeNextMultiple:
        syntaxCapabilities.rangeEndRules.includes("next_multiple_address"),
      rangeEndRulesIncludeRelative:
        syntaxCapabilities.rangeEndRules.includes("relative_address"),
      substituteFlagsIncludeExecute:
        syntaxCapabilities.substituteFlagRules.includes("execute_flag"),
      textArgumentsIncludeInline: syntaxCapabilities.textArgumentRules.includes(
        "_inline_text_argument",
      ),
    },
    {
      addressRulesIncludePeriodic: true,
      extendedCommandLoopWhitespace: true,
      ignoreCaseFlags: ["i", "I"],
      listWidth: true,
      quitStatus: true,
      rangeEndRulesIncludeNextMultiple: true,
      rangeEndRulesIncludeRelative: true,
      substituteFlagsIncludeExecute: true,
      textArgumentsIncludeInline: true,
    },
  );
});

test("a narrower syntax profile cannot remove broader syntax capabilities", () => {
  const syntax = mergeSyntax(profiles.posix, profiles.gnu, {
    name: "narrowed",
    syntax: {
      addressRules: ["line_number_address"],
      quitStatus: false,
    },
  });

  assert.deepEqual(
    {
      addressRulesIncludePeriodic:
        syntax.addressRules.includes("periodic_address"),
      quitStatus: syntax.quitStatus,
    },
    {
      addressRulesIncludePeriodic: true,
      quitStatus: true,
    },
  );
});

test("registers the dialect-specific grammar rules from both profiles", () => {
  assert.deepEqual(
    {
      gnuInlineTextArgument: typeof profiles.gnu.rules._inline_text_argument,
      mergedRuleCount: Object.keys(mergeRules(profiles.posix, profiles.gnu))
        .length,
      periodicAddress: typeof dialectRules.periodic_address,
      posixBackslashTextArgument:
        typeof profiles.posix.rules._backslash_text_argument,
    },
    {
      gnuInlineTextArgument: "function",
      mergedRuleCount: Object.keys(dialectRules).length,
      periodicAddress: "function",
      posixBackslashTextArgument: "function",
    },
  );
});
