import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ensure that MORE properties are not required in the request. FEWER is okay.
 */
export function compareRequestRequiredRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] | undefined {
  if (!data.path) return;
  const path = data.path.join(".");
  if (!path.endsWith("required")) return;
  if (!path.includes("parameters")) return;
  if (data.kind === "D") {
    return RuleResult.NoViolation;
  }
  if (data.kind === "N") {
    return RuleResult.FlaggedViolation;
  }
}
