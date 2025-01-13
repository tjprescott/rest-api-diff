import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ignore the Swagger top-level and operation-level "tags" property.
 */
export function ignoreTagsRule(data: Diff<any, any>): RuleResult | undefined {
  if (!data.path) return;
  if (data.path.length === 4 || data.path.length === 1) {
    const lastPath = data.path.slice(-1)[0];
    if (lastPath === "tags") return RuleResult.NoViolation;
  } else if (data.path.length === 5) {
    const secondToLastPath = data.path.slice(-2)[0];
    if (secondToLastPath === "tags") return RuleResult.NoViolation;
  }
}
