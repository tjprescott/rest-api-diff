import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Consumes changed.
 */
export function xReadOnlyChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  if (data.path.length < 4) return;

  // This is filtered out be a different rule!
  if (data.path[3] === "responses") return;

  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "readOnly") return;
  if (data.kind === "D") return RuleResult.NoViolation;
  return RuleResult.FlaggedViolation;
}
