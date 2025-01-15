import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Some property of a "properties" field was removed.
 */
export function xPropertyRemovedRule(
  data: Diff<any, any>
): [RuleResult, string] | undefined {
  if (!data.path) return;
  if (data.path.length < 3) return;

  const secondToLastPath = data.path[data.path.length - 2];
  if (data.kind !== "D") return;
  if (secondToLastPath !== "properties") return;
  const message = `Property missing from RHS: ${data.path[data.path.length - 1]}`;
  return [RuleResult.FlaggedViolation, message];
}
