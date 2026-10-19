import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const seatRulesDirectory = path.join(repositoryRoot, "src", "domain");
const forbiddenAreas = ["src/app", "src/adapter"];

const asRepositoryPath = (absolute: string): string =>
  path.relative(repositoryRoot, absolute).split(path.sep).join("/");

const modulesUnder = (directory: string): readonly string[] => {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return modulesUnder(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
};

const specifiersOf = (source: string): readonly string[] =>
  [...source.matchAll(/(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);

const leadsOutOfTheSeatRules = (options: { readonly module: string; readonly specifier: string }): boolean => {
  const target = options.specifier.startsWith(".")
    ? asRepositoryPath(path.resolve(path.dirname(options.module), options.specifier))
    : options.specifier.split("\\").join("/");
  return forbiddenAreas.some((area) => target === area || target.startsWith(`${area}/`) || target.includes(`/${area}/`));
};

describe("The seat rules do not depend on the service around them", () => {
  it("no module of the seat rules imports the application or the edge [AT-dependency-direction]", () => {
    const seatRuleModules = modulesUnder(seatRulesDirectory);
    const crossings = seatRuleModules.flatMap((module) =>
      specifiersOf(readFileSync(module, "utf8"))
        .filter((specifier) => leadsOutOfTheSeatRules({ module, specifier }))
        .map((specifier) => `${asRepositoryPath(module)} imports ${specifier}`),
    );

    expect(
      seatRuleModules.length,
      [
        `WHAT: no module was found under ${asRepositoryPath(seatRulesDirectory)}, so this check looked at an empty set of seat rules.`,
        "WHY: a check over an empty set passes for the same reason whether the rules are clean or absent, so it must say which of the two it saw.",
        `HOW: place the pure seat values and the pure seat transition under ${asRepositoryPath(seatRulesDirectory)}, where they depend on nothing else in this repository.`,
      ].join("\n"),
    ).toBeGreaterThan(0);
    expect(
      crossings,
      [
        `WHAT: ${crossings.length} of the ${seatRuleModules.length} seat rule modules reach into ${forbiddenAreas.join(" or ")}: ${crossings.join(", ")}.`,
        "WHY: the seat rules are a pure core that the service, the store, the clock and the HTTP edge depend on, and never the other way round; a reversed dependency makes the rules untestable on their own and leaves the proof without a matching subject.",
        "HOW: move whatever the seat rules need into the seat rules themselves, or pass it in as an argument, and keep every port declaration in the application layer.",
      ].join("\n"),
    ).toEqual([]);
  });
});
