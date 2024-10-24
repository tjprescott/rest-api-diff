import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Consumes changed.
 */
export function xConsumesChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "consumes") return;
  return RuleResult.FlaggedViolation;
}
