import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Flags when a type value has changed.
 */
export function flagTypeDifferencesRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "type") return;
  const lhs = (data as any).lhs ?? "undefined";
  const rhs = (data as any).rhs ?? "undefined";

  // This is handled by a different rule
  if (lhs === "undefined" && rhs === "object") return;

  const message = `Type changed from '${lhs}' to '${rhs}'.`;
  return [RuleResult.FlaggedViolation, message];
}
