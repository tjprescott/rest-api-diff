import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ignores differences in x-ms-identifiers when the arrays are empty.
 */
export function compareXMsIdentifiersRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] | undefined {
  if (!data.path) return;
  if (data.path[data.path.length - 1] !== "x-ms-identifiers") {
    return;
  }
  const lhs = (data as any).lhs || [];
  const rhs = (data as any).rhs || [];
  if (lhs.length === 0 && rhs.length === 0) {
    return RuleResult.NoViolation;
  }
}
