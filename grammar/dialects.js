const posix = require("./posix");
const gnu = require("./gnu");

function itemKey(item) {
  return typeof item === "string" ? item : JSON.stringify(item);
}

function mergeSyntax(...profiles) {
  const merged = {};

  for (const profile of profiles) {
    for (const [capability, value] of Object.entries(profile.syntax || {})) {
      if (Array.isArray(value)) {
        const previous = merged[capability] || [];
        const seen = new Set(previous.map(itemKey));
        merged[capability] = [...previous];
        for (const item of value) {
          const key = itemKey(item);
          if (!seen.has(key)) {
            merged[capability].push(item);
            seen.add(key);
          }
        }
      } else if (typeof value === "boolean") {
        merged[capability] = Boolean(merged[capability] || value);
      } else {
        throw new Error(
          `Unsupported sed syntax capability ${capability} in ${profile.name}`,
        );
      }
    }
  }

  return merged;
}

function mergeRules(...profiles) {
  const rules = {};

  for (const profile of profiles) {
    for (const [name, rule] of Object.entries(profile.rules || {})) {
      if (rules[name] && rules[name] !== rule) {
        throw new Error(`Conflicting sed dialect rule: ${name}`);
      }
      rules[name] = rule;
    }
  }

  return rules;
}

function mergeProfiles(...profiles) {
  const commandsByRule = new Map();
  const aliasesByRule = new Map();

  for (const profile of profiles) {
    for (const descriptor of profile.commands) {
      const previousAlias = aliasesByRule.get(descriptor.rule);

      if (
        previousAlias &&
        descriptor.alias &&
        previousAlias !== descriptor.alias
      ) {
        throw new Error(
          `Conflicting aliases for sed command ${descriptor.rule}: ` +
            `${previousAlias} and ${descriptor.alias}`,
        );
      }

      if (descriptor.alias) {
        aliasesByRule.set(descriptor.rule, descriptor.alias);
      }

      const commands = commandsByRule.get(descriptor.rule) || [];
      commands.push({ ...descriptor });
      commandsByRule.set(descriptor.rule, commands);
    }
  }

  const merged = [];

  for (const [rule, descriptors] of commandsByRule) {
    const alias = aliasesByRule.get(rule);
    const distinct = [];
    const seen = new Set();

    for (const descriptor of descriptors) {
      const normalized = alias ? { ...descriptor, alias } : descriptor;
      const key = JSON.stringify({
        maxAddresses: normalized.maxAddresses,
        termination: normalized.termination,
        allowsZeroAddress: Boolean(normalized.allowsZeroAddress),
      });

      if (!seen.has(key)) {
        distinct.push(normalized);
        seen.add(key);
      }
    }

    for (const descriptor of distinct) {
      const isCovered = distinct.some(
        (candidate) =>
          candidate !== descriptor &&
          candidate.maxAddresses >= descriptor.maxAddresses &&
          (candidate.termination === descriptor.termination ||
            (candidate.termination === "chainable" &&
              descriptor.termination === "line")) &&
          (candidate.allowsZeroAddress || !descriptor.allowsZeroAddress),
      );

      if (!isCovered) {
        merged.push(descriptor);
      }
    }
  }

  return merged;
}

function groupCommands(commands) {
  const groups = {
    zeroAddressChainable: [],
    oneAddressChainable: [],
    twoAddressChainable: [],
    zeroAddressLineTerminated: [],
    oneAddressLineTerminated: [],
    twoAddressLineTerminated: [],
  };

  for (const descriptor of commands) {
    const { maxAddresses, termination } = descriptor;
    let group;

    if (termination === "chainable" && maxAddresses === 0) {
      group = groups.zeroAddressChainable;
    } else if (termination === "chainable" && maxAddresses === 1) {
      group = groups.oneAddressChainable;
    } else if (termination === "chainable" && maxAddresses === 2) {
      group = groups.twoAddressChainable;
    } else if (termination === "line" && maxAddresses === 0) {
      group = groups.zeroAddressLineTerminated;
    } else if (termination === "line" && maxAddresses === 1) {
      group = groups.oneAddressLineTerminated;
    } else if (termination === "line" && maxAddresses === 2) {
      group = groups.twoAddressLineTerminated;
    } else {
      throw new Error(
        `Unsupported sed command capability: ${descriptor.rule} ` +
          `(maxAddresses=${maxAddresses}, termination=${termination})`,
      );
    }

    group.push(descriptor);
  }

  return groups;
}

module.exports = {
  profiles: { posix, gnu },
  mergeProfiles,
  mergeSyntax,
  mergeRules,
  groupCommands,
  commandGroups: groupCommands(mergeProfiles(posix, gnu)),
  syntaxCapabilities: mergeSyntax(posix, gnu),
  dialectRules: mergeRules(posix, gnu),
};
