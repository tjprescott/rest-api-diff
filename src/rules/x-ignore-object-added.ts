import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Flags when a type value has changed.
 */
export function xIgnoreObjectAddedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "type") return;

  // Ignore if the "object" type was added to the RHS
  const lhs = (data as any).lhs;
  const rhs = (data as any).rhs;
  if (lhs === undefined && rhs === "object") {
    return RuleResult.NoViolation;
  }
}
