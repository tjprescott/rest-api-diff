import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ensure that FEWER properties are not required in the response. MORE is okay.
 */
export function compareResponseRequiredRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] | undefined {
  if (!data.path) return;
  const path = data.path.join(".");
  if (!path.endsWith("required")) return;
  if (!path.includes("responses")) return;
  if (data.kind === "N") {
    return RuleResult.NoViolation;
  }
  if (data.kind === "D") {
    return RuleResult.FlaggedViolation;
  }
}
