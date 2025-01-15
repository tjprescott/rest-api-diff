import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Parameter "in" property changed.
 */
export function xParameterInChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length !== 6) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "in") return;
  return RuleResult.FlaggedViolation;
}
