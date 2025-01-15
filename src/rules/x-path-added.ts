import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";
import { OpenAPIV2 } from "openapi-types";

/**
 * Path added to RHS that isn't in LHS.
 */
export function xPathAddedRule(data: Diff<any, any>): RuleResult | undefined {
  if (!data.path || data.path.length !== 2) return;
  if (data.path[0] !== "paths" || data.kind !== "N") return;
  return RuleResult.FlaggedViolation;
}
