import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Format changed
 */
export function xFormatChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "format") return;
  return RuleResult.FlaggedViolation;
}
