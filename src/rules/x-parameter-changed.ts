import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Parameter property changed.
 */
export function xParameterChangedRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path || data.path.length !== 4)
    return RuleResult.ContinueProcessing;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "parameters") return RuleResult.ContinueProcessing;
  return RuleResult.FlaggedViolation;
}
