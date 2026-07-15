import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(process.cwd(), "src");
const excludedRoot = path.join(sourceRoot, "lib", "legacy");
const legacyPatterns = [
  "targetArrivalTime",
  "target_arrival_time",
  "estimateTravelOption",
  "scoreCheapest",
  "scoreBalanced",
  "scoreFastest",
  "PARTIAL_ESTIMATE_FALLBACK",
  "cheapest",
  "balanced",
  "fastest",
  "/explain",
] as const;

function collectSourceFiles(directory: string): string[] {
  if (directory === excludedRoot) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectSourceFiles(entryPath) : [entryPath];
  });
}

describe("legacy recommendation path guard", () => {
  it("keeps legacy estimates, three-city scoring, and explain paths out of production source", () => {
    const matches = collectSourceFiles(sourceRoot).flatMap((filePath) => {
      const contents = readFileSync(filePath, "utf8");
      const relativePath = path.relative(process.cwd(), filePath).split(path.sep).join("/");
      const searchableText = `${relativePath}\n${contents}`;

      return legacyPatterns.flatMap((pattern) =>
        searchableText.includes(pattern) ? [`${relativePath}: ${pattern}`] : [],
      );
    });

    expect(matches, matches.join("\n")).toEqual([]);
  });
});
