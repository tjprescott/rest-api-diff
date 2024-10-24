import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Name differs between LHS and RHS.
 */
export function xNameChangedRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path) return RuleResult.ContinueProcessing;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "name") return RuleResult.ContinueProcessing;
  if (data.kind === "E") {
    const message = `Name changed from '${data.lhs}' on LHS to '${data.rhs}' on RHS.`;
    return [RuleResult.FlaggedViolation, message];
  }
  return RuleResult.ContinueProcessing;
}
