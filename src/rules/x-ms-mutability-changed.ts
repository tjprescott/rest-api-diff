import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Flag when x-ms-mutability changed. Exception when location mutability was added by
 * a TypeSpec template.
 */
export function xMsMutabilityChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  if (data.path.length < 2) return;
  const lastPaths = data.path.slice(-2);
  if (!lastPaths.includes("x-ms-mutability")) return;
  // exception for a specific pattern in Compute that was deemed okay.
  if (
    JSON.stringify(lastPaths) ===
      JSON.stringify(["location", "x-ms-mutability"]) &&
    data.kind == "N" &&
    JSON.stringify(data.rhs) === JSON.stringify(["create", "read"])
  ) {
    return RuleResult.NoViolation;
  }
  return RuleResult.FlaggedViolation;
}
