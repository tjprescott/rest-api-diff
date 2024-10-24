import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * x-nullable removed from a property.
 */
export function xNullableRemovedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (data.kind !== "D") return;
  if (lastPath !== "x-nullable") return;
  return RuleResult.FlaggedViolation;
}
