import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Name differs between LHS and RHS.
 */
export function xNameChangedRule(data: Diff<any, any>): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "name") return;
  if (data.kind !== "E") return;
  return RuleResult.FlaggedViolation;
}
