import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ignores when the type of an object changed between "undefined" and "object".
 */
export function xIgnoreObjectChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "type") return;

  // For our purposes, "type: object" is the same as "type: undefined"
  // This is not technically correct, since "type: undefined" actually
  // means unconstrained, but it is good enough for our purposes.
  const lhs = (data as any).lhs;
  const rhs = (data as any).rhs;
  if (lhs === undefined && rhs === "object") return RuleResult.NoViolation;
  if (lhs === "object" && rhs === undefined) return RuleResult.NoViolation;
}
