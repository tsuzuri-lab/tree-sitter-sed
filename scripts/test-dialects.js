#!/usr/bin/env node
const assert = require("node:assert/strict");
const {
  profiles,
  mergeProfiles,
  mergeSyntax,
  mergeRules,
  groupCommands,
  commandGroups,
  syntaxCapabilities,
  dialectRules,
} = require("../grammar/dialects");

function rules(descriptors) {
  return descriptors.map(({ rule }) => rule);
}

const posixGroups = groupCommands(mergeProfiles(profiles.posix));
assert.deepEqual(rules(posixGroups.zeroAddressLineTerminated), ["label_command"]);
assert.deepEqual(rules(posixGroups.oneAddressLineTerminated), [
  "append_command",
  "insert_command",
  "read_command",
]);
assert.ok(rules(posixGroups.twoAddressChainable).includes("list_command"));

assert.deepEqual(commandGroups.zeroAddressLineTerminated, []);
assert.deepEqual(commandGroups.oneAddressLineTerminated, []);
assert.ok(rules(commandGroups.zeroAddressChainable).includes("label_command"));
assert.ok(rules(commandGroups.twoAddressChainable).includes("list_command"));
assert.ok(rules(commandGroups.twoAddressLineTerminated).includes("read_command"));

const reversedMerge = mergeProfiles(profiles.gnu, profiles.posix);
for (const descriptor of mergeProfiles(profiles.posix, profiles.gnu)) {
  const reversed = reversedMerge.find(({ rule }) => rule === descriptor.rule);
  assert.equal(reversed.maxAddresses, descriptor.maxAddresses);
  assert.equal(reversed.termination, descriptor.termination);
  assert.equal(reversed.alias, descriptor.alias);
}

const narrowedProfile = {
  commands: [
    { rule: "line_number_command", maxAddresses: 1, termination: "line" },
  ],
};
const narrowedMerge = mergeProfiles(profiles.posix, profiles.gnu, narrowedProfile);
const lineNumber = narrowedMerge.find(
  ({ rule }) => rule === "line_number_command",
);
assert.equal(lineNumber.maxAddresses, 2);
assert.equal(lineNumber.termination, "chainable");

const posixSyntax = mergeSyntax(profiles.posix);
assert.ok(posixSyntax.addressRules.includes("line_number_address"));
assert.ok(!posixSyntax.addressRules.includes("periodic_address"));
assert.equal(posixSyntax.extendedCommandLoopWhitespace, false);
assert.deepEqual(posixSyntax.ignoreCaseFlags, ["i"]);
assert.equal(posixSyntax.quitStatus, false);
assert.equal(posixSyntax.listWidth, false);

assert.ok(syntaxCapabilities.addressRules.includes("periodic_address"));
assert.equal(syntaxCapabilities.extendedCommandLoopWhitespace, true);
assert.ok(syntaxCapabilities.rangeEndRules.includes("relative_address"));
assert.ok(syntaxCapabilities.rangeEndRules.includes("next_multiple_address"));
assert.ok(syntaxCapabilities.substituteFlagRules.includes("execute_flag"));
assert.deepEqual(syntaxCapabilities.ignoreCaseFlags, ["i", "I"]);
assert.ok(syntaxCapabilities.textArgumentRules.includes("_inline_text_argument"));
assert.equal(syntaxCapabilities.quitStatus, true);
assert.equal(syntaxCapabilities.listWidth, true);

const narrowedSyntax = mergeSyntax(profiles.posix, profiles.gnu, {
  name: "narrowed",
  syntax: {
    addressRules: ["line_number_address"],
    quitStatus: false,
  },
});
assert.ok(narrowedSyntax.addressRules.includes("periodic_address"));
assert.equal(narrowedSyntax.quitStatus, true);

assert.equal(typeof profiles.posix.rules._backslash_text_argument, "function");
assert.equal(typeof profiles.gnu.rules._inline_text_argument, "function");
assert.equal(typeof dialectRules.periodic_address, "function");
assert.equal(
  Object.keys(mergeRules(profiles.posix, profiles.gnu)).length,
  Object.keys(dialectRules).length,
);

console.log("Verified POSIX and GNU dialect capability profiles");
