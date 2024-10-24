import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * additionalProperties changed, unless it was simply added with a value of {}
 */
export function xAdditionalPropertiesChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "additionalProperties") return;
  // Permit RHS to have an empty object here as the meaning is the same as being omitted
  if (data.kind === "N" && Object.keys(data.rhs).length === 0)
    return RuleResult.NoViolation;
  return RuleResult.FlaggedViolation;
}
