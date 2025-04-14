import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Some property of a "properties" field was added.
 */
export function xPropertyAddedRule(
  data: Diff<any, any>
): [RuleResult, string] | undefined {
  if (!data.path) return;
  if (data.path.length < 3) return;

  const secondToLastPath = data.path[data.path.length - 2];
  if (data.kind !== "N") return;
  if (secondToLastPath !== "properties") return;
  const message = `Property missing from LHS: ${data.path[data.path.length - 1]}`;
  return [RuleResult.FlaggedViolation, message];
}
