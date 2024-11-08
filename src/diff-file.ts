import * as fs from "fs";
import { DiffDeleted, DiffEdit, DiffNew } from "deep-diff";
import { RuleResult } from "./rules/rules.js";

export interface DiffItem {
  ruleResult: RuleResult;
  ruleName?: string;
  message?: string;
  diff: DiffNew<any> | DiffEdit<any, any> | DiffDeleted<any>;
}

export interface DiffGroupingResult {
  name: string;
  count: number;
  items: DiffItem[];
}

export async function writeGroupedViolations(
  differences: DiffItem[],
  path: string
) {
  const defaultRule = "assumedViolation";
  const groupedDiff: { [key: string]: DiffGroupingResult } = {};
  for (const diff of differences) {
    const ruleName = diff.ruleName ?? defaultRule;
    if (!groupedDiff[ruleName]) {
      groupedDiff[ruleName] = {
        name: ruleName,
        count: 0,
        items: [],
      };
    }
    groupedDiff[ruleName]!.items.push(diff);
    groupedDiff[ruleName]!.count++;
  }
  const groupedDiffArray = Object.values(groupedDiff);
  // Sort by count descending
  groupedDiffArray.sort((a, b) => b.count - a.count);
  fs.writeFileSync(path, JSON.stringify(groupedDiffArray, null, 2));
}

export async function writeFlatViolations(
  differences: DiffItem[],
  path: string
) {
  fs.writeFileSync(path, JSON.stringify(differences, null, 2));
}
