import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Added Enum to RHS
 */
export function xEnumAddedRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path) return RuleResult.ContinueProcessing;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "enum") return RuleResult.ContinueProcessing;
  if (data.kind === "N") {
    const message = `enum added to RHS.`;
    return [RuleResult.FlaggedViolation, message];
  }
  return RuleResult.ContinueProcessing;
}
