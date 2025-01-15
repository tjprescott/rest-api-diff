import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Parameter property changed.
 */
export function xParameterChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length !== 4) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "parameters") return;
  return RuleResult.FlaggedViolation;
}
