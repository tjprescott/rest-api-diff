import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Name differs between LHS and RHS.
 */
export function xNameChangedRule(data: Diff<any, any>): RuleResult | undefined {
  if (!data.path) return;
  if (data.path.length < 2) return;
  const lastPath = data.path[data.path.length - 1];
  const secondToLastPath = data.path[data.path.length - 2];
  if (lastPath !== "name") return;
  // This is handled by a base rule.
  if (secondToLastPath === "x-ms-enum") return;
  if (data.kind !== "E") return;
  return RuleResult.FlaggedViolation;
}
