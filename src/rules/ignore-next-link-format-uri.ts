import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ignores a diff when "format: uri" is added to nextLink parameter.
 */
export function ignoreNextLinkFormatUriRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  if (data.kind !== "N") return;
  const path = data.path.join(".");
  if (path.endsWith("properties.nextLink.format")) {
    return RuleResult.NoViolation;
  }
}
