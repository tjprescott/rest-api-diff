import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * A default field with a value of false was removed.
 */
export function xDefaultFalseRemovedRule(
  data: Diff<any, any>
): [RuleResult, string] | undefined {
  if (!data.path) return;
  if (data.path.length < 3) return;

  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "default") return;
  if (data.kind !== "D") return;
  if (data.lhs !== false) return;
  const message = `Property has a default value of false, which was removed: ${data.path[data.path.length - 2]}`;
  return [RuleResult.FlaggedViolation, message];
}
