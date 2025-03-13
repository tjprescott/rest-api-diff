import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Format differs between LHS and RHS. Ignores if one side was omitted
 * and the other is false since that is the default.
 */
export function xMsLongRunningOperationChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "x-ms-long-running-operation") return;
  // ignore logically equivalent defaults
  if (data.kind == "N" && data.rhs == false) return RuleResult.NoViolation;
  if (data.kind == "D" && data.lhs == false) return RuleResult.NoViolation;
}
