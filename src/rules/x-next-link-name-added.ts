import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Added nextLinkName=nextLink to RHS. This is fine since if it wasn't present
 * in the LHS, the default was interpreted as "nextLink" anyways.
 */
export function xNextLinkNameAddedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length < 2) return;
  const lastPaths = data.path.slice(-2);
  if (
    !(
      JSON.stringify(lastPaths) ==
      JSON.stringify(["x-ms-pageable", "nextLinkName"])
    )
  )
    return;
  if (data.kind !== "N") return;
  if (data.rhs === "nextLink") return RuleResult.NoViolation;
}
