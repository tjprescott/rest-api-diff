import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * x-nullable changed on a property unless the values are logically equivalent.
 */
export function xNullableChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "x-nullable") return;
  // ignore logically equivalent defaults
  if (data.kind == "N" && data.rhs === false) return RuleResult.NoViolation;
  if (data.kind == "D" && data.lhs === false) return RuleResult.NoViolation;
}
