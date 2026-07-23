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
  const commands = new Map();

  for (const profile of profiles) {
    for (const descriptor of profile.commands) {
      const previous = commands.get(descriptor.rule);
      if (!previous) {
        commands.set(descriptor.rule, { ...descriptor });
        continue;
      }

      if (
        previous.alias &&
        descriptor.alias &&
        previous.alias !== descriptor.alias
      ) {
        throw new Error(
          `Conflicting aliases for sed command ${descriptor.rule}: ` +
            `${previous.alias} and ${descriptor.alias}`,
        );
      }

      commands.set(descriptor.rule, {
        ...previous,
        ...descriptor,
        alias: previous.alias || descriptor.alias,
        maxAddresses: Math.max(previous.maxAddresses, descriptor.maxAddresses),
        termination:
          previous.termination === "chainable" ||
          descriptor.termination === "chainable"
            ? "chainable"
            : "line",
      });
    }
  }

  return [...commands.values()];
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
