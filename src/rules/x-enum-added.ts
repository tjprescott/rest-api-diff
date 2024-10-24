import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Added Enum to RHS
 */
export function xEnumAddedRule(data: Diff<any, any>): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "enum") return;
  if (data.kind === "N") {
    return RuleResult.FlaggedViolation;
  }
}
