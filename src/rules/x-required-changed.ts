import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Consumes changed.
 */
export function xRequiredChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "required") return;
  return RuleResult.FlaggedViolation;
}
