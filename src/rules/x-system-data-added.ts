import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ignores if systemData is added to the RHS.
 */
export function xSystemDataAddedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "systemData") return;
  if (data.kind === "N") {
    return RuleResult.NoViolation;
  }
}
